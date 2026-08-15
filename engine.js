/*
  SmartSpend AI — Analysis Engine
  Pure, dependency-free JS. No DOM access anywhere in this file so it can be
  unit-tested under Node and reused unchanged in the browser.
*/
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SmartSpendEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------------------------------------------------------------- CSV ----
  function parseCSV(text) {
    // Handles quoted fields, embedded commas/newlines/escaped quotes.
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    let i = 0;
    const n = text.length;
    while (i < n) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      } else {
        if (c === '"') { inQuotes = true; i++; continue; }
        if (c === ",") { row.push(field); field = ""; i++; continue; }
        if (c === "\r") { i++; continue; }
        if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
        field += c; i++; continue;
      }
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    const filtered = rows.filter(r => !(r.length === 1 && r[0] === ""));
    if (filtered.length === 0) return [];
    const headers = filtered[0].map(h => h.trim());
    const out = [];
    for (let r = 1; r < filtered.length; r++) {
      const rowArr = filtered[r];
      if (rowArr.length === 1 && rowArr[0].trim() === "") continue;
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = rowArr[idx] !== undefined ? rowArr[idx] : ""; });
      out.push(obj);
    }
    return out;
  }

  // ----------------------------------------------------- column detection ----
  const COLUMN_ALIASES = {
    date: ["date", "transaction date", "transaction_date", "txn date", "posting date"],
    amount: ["amount", "expense", "amt", "value", "transaction amount", "debit", "price"],
    category: ["category", "spending category", "type of expense", "expense category"],
    merchant: ["merchant", "description", "payee", "vendor", "narration", "particulars"],
    payment_method: ["payment method", "payment_method", "mode", "payment mode", "channel"],
    type: ["type", "transaction type", "txn type", "debit/credit", "dr/cr"],
    transaction_id: ["transaction id", "transaction_id", "txn id", "id", "reference no"],
  };
  const REQUIRED_ROLES = ["date", "amount"];

  function normalize(s) { return String(s).trim().toLowerCase().replace(/_/g, " "); }

  function detectColumns(headers) {
    const normMap = {};
    headers.forEach(h => { normMap[normalize(h)] = h; });
    const detected = {};
    for (const role in COLUMN_ALIASES) {
      let found = null;
      for (const alias of COLUMN_ALIASES[role]) {
        if (normMap[alias]) { found = normMap[alias]; break; }
      }
      if (!found) {
        for (const normName in normMap) {
          if (COLUMN_ALIASES[role].some(alias => normName.indexOf(alias) !== -1)) {
            found = normMap[normName]; break;
          }
        }
      }
      if (found) detected[role] = found;
    }
    const unmatched = REQUIRED_ROLES.filter(r => !detected[r]);
    return { detected, unmatched };
  }

  // -------------------------------------------------------------- validate ----
  function parseDateFlexible(v) {
    if (v === null || v === undefined || v === "") return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    const s = String(v).trim();
    // try native parse first (handles ISO, "Jan 5 2026", etc.)
    let d = new Date(s);
    if (!isNaN(d.getTime())) return d;
    // try DD/MM/YYYY or MM/DD/YYYY
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      let [_, a, b, y] = m;
      if (y.length === 2) y = "20" + y;
      // assume MM/DD/YYYY
      d = new Date(`${y}-${a.padStart(2, "0")}-${b.padStart(2, "0")}`);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  }

  function parseAmount(v) {
    if (v === null || v === undefined || v === "") return NaN;
    if (typeof v === "number") return v;
    const cleaned = String(v).replace(/[^\d.\-]/g, "");
    if (cleaned === "" || cleaned === "-") return NaN;
    const f = parseFloat(cleaned);
    return isNaN(f) ? NaN : f;
  }

  function validateData(rows, mapping) {
    const report = { messages: [], nRows: rows.length, criticalError: null };
    if (!mapping.date) {
      report.criticalError = "We couldn't identify a transaction date column. Please select the correct column from the dropdown.";
      return report;
    }
    if (!mapping.amount) {
      report.criticalError = "We couldn't identify a transaction amount column. Please select the correct column from the dropdown.";
      return report;
    }
    report.messages.push(["ok", `${rows.length.toLocaleString()} transactions loaded`]);
    report.messages.push(["ok", `Date column detected: '${mapping.date}'`]);
    report.messages.push(["ok", `Amount column detected: '${mapping.amount}'`]);

    let nBadDates = 0, nBadAmounts = 0, nNeg = 0, nZero = 0;
    rows.forEach(r => {
      if (!parseDateFlexible(r[mapping.date])) nBadDates++;
      const a = parseAmount(r[mapping.amount]);
      if (isNaN(a)) nBadAmounts++;
      else { if (a < 0) nNeg++; if (a === 0) nZero++; }
    });
    if (nBadDates) report.messages.push(["warn", `${nBadDates} rows have missing or invalid dates`]);
    if (nBadAmounts) report.messages.push(["warn", `${nBadAmounts} rows have missing or non-numeric amounts`]);
    if (nNeg) report.messages.push(["info", `${nNeg} negative amounts found (may represent refunds/credits)`]);
    if (nZero) report.messages.push(["warn", `${nZero} zero-value transactions found`]);

    if (mapping.category) {
      const nMissingCat = rows.filter(r => !r[mapping.category] || String(r[mapping.category]).trim() === "").length;
      if (nMissingCat) report.messages.push(["warn", `${nMissingCat} missing categories`]);
    } else {
      report.messages.push(["warn", "No category column detected — spending will be grouped as 'Uncategorized'"]);
    }

    const seen = new Set(); let nDupes = 0;
    rows.forEach(r => {
      const key = JSON.stringify(r);
      if (seen.has(key)) nDupes++; else seen.add(key);
    });
    if (nDupes) report.messages.push(["warn", `${nDupes} duplicate records found`]);

    const months = new Set();
    rows.forEach(r => {
      const d = parseDateFlexible(r[mapping.date]);
      if (d) months.add(d.getFullYear() + "-" + d.getMonth());
    });
    if (months.size <= 1) report.messages.push(["info", "Only one month of data detected — monthly trend and forecast features will be limited"]);
    if (rows.length < 15) report.messages.push(["warn", "This is a very small dataset — statistical features (anomaly detection, forecasting) may be unreliable"]);

    report.nMonths = months.size;
    return report;
  }

  // -------------------------------------------------------------- cleaning ----
  function titleCase(s) {
    return String(s).trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }

  const CATEGORY_SYNONYMS = {
    "Food & Dining": "Food", "Food And Dining": "Food", "Dining": "Food", "Groceries": "Food",
  };

  function cleanTransactions(rows, mapping) {
    const log = { steps: [], rowsBefore: rows.length };
    let out = rows.map(r => {
      const o = {};
      for (const role in mapping) o[role] = r[mapping[role]];
      return o;
    });

    // date
    out.forEach(o => { o.date = parseDateFlexible(o.date); });
    let before = out.length;
    out = out.filter(o => o.date !== null);
    if (before - out.length > 0) log.steps.push(`Removed ${before - out.length} rows with missing/invalid dates (date could not be parsed).`);

    // amount
    out.forEach(o => { o.amount = parseAmount(o.amount); });
    before = out.length;
    out = out.filter(o => !isNaN(o.amount));
    if (before - out.length > 0) log.steps.push(`Removed ${before - out.length} rows with missing/non-numeric amounts.`);

    const nZero = out.filter(o => o.amount === 0).length;
    if (nZero) log.steps.push(`Kept ${nZero} zero-value transactions (retained, not removed — flagged for review).`);

    // category
    let nMissingCat = 0;
    out.forEach(o => {
      if (o.category === undefined) { o.category = "Uncategorized"; return; }
      let c = String(o.category).trim();
      if (c === "" || c.toLowerCase() === "nan") { nMissingCat++; c = "Uncategorized"; }
      else { c = titleCase(c); c = CATEGORY_SYNONYMS[c] || c; }
      o.category = c;
    });
    if (nMissingCat) log.steps.push(`Filled ${nMissingCat} missing categories with 'Uncategorized' (not dropped, to preserve spending totals).`);
    log.steps.push("Standardized category text: trimmed whitespace, applied consistent Title Case, merged known synonyms (e.g. 'Food & Dining' -> 'Food').");

    // merchant/description
    out.forEach(o => {
      if (o.merchant) o.merchant = String(o.merchant).trim();
      if (!o.merchant) o.merchant = "Unknown";
    });

    // payment method
    out.forEach(o => {
      o.payment_method = o.payment_method ? titleCase(o.payment_method) : "Unknown";
    });

    // type
    let hadType = out.length > 0 && out[0].type !== undefined;
    out.forEach(o => {
      if (o.type) {
        let t = titleCase(o.type);
        if (t === "Debit" || t === "Dr") t = "Expense";
        if (t === "Credit" || t === "Cr") t = "Income";
        if (t !== "Income" && t !== "Expense") t = o.amount < 0 ? "Income" : "Expense";
        o.type = t;
      } else {
        o.type = "Expense";
      }
    });
    if (!hadType) log.steps.push("No transaction Type column found — all rows treated as Expense (income analysis will be limited).");

    out.forEach(o => { o.amount = Math.abs(o.amount); });

    // transaction id
    out.forEach((o, i) => { if (!o.transaction_id) o.transaction_id = "T" + String(i + 1).padStart(4, "0"); });

    // duplicates (date+amount+merchant+category)
    const seen = new Set();
    const deduped = [];
    let nDupes = 0;
    out.forEach(o => {
      const key = [o.date.toISOString().slice(0, 10), o.amount, o.merchant, o.category].join("|");
      if (seen.has(key)) { nDupes++; return; }
      seen.add(key);
      deduped.push(o);
    });
    if (nDupes) log.steps.push(`Removed ${nDupes} exact duplicate transactions (same date, amount, merchant, category).`);

    deduped.sort((a, b) => a.date - b.date);
    log.rowsAfter = deduped.length;
    log.rowsRemoved = log.rowsBefore - log.rowsAfter;
    return { cleaned: deduped, log };
  }

  // -------------------------------------------------------- feature engineering ----
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  function quarterOf(m) { return Math.floor(m / 3) + 1; }

  function addFeatures(cleaned) {
    const out = cleaned.map(o => ({ ...o }));
    out.forEach(o => {
      const d = o.date;
      o.year = d.getFullYear();
      o.month = d.getMonth() + 1;
      o.month_key = o.year * 100 + o.month;
      o.month_name = MONTH_NAMES[d.getMonth()] + " " + o.year;
      o.quarter = quarterOf(d.getMonth());
      o.day = d.getDate();
      o.day_of_week = DAY_NAMES[d.getDay()];
      o.is_weekend = d.getDay() === 0 || d.getDay() === 6;
    });
    const expenseAmounts = out.filter(o => o.type === "Expense").map(o => o.amount).sort((a, b) => a - b);
    if (expenseAmounts.length >= 5) {
      const q1 = quantile(expenseAmounts, 0.33);
      const q3 = quantile(expenseAmounts, 0.75);
      out.forEach(o => {
        o.transaction_size = o.amount <= q1 ? "Small" : (o.amount <= q3 ? "Medium" : "Large");
      });
    } else {
      out.forEach(o => { o.transaction_size = "N/A"; });
    }
    return out;
  }

  function quantile(sortedArr, q) {
    if (sortedArr.length === 0) return NaN;
    const pos = (sortedArr.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sortedArr[base + 1] !== undefined) {
      return sortedArr[base] + rest * (sortedArr[base + 1] - sortedArr[base]);
    }
    return sortedArr[base];
  }

  function orderedMonths(featured) {
    const seen = new Map();
    featured.slice().sort((a, b) => a.date - b.date).forEach(o => {
      if (!seen.has(o.month_name)) seen.set(o.month_name, o.date);
    });
    return Array.from(seen.keys());
  }

  function hasIncomeData(featured) { return featured.some(o => o.type === "Income"); }

  function monthlyCashFlow(featured) {
    const months = orderedMonths(featured);
    return months.map(m => {
      const rows = featured.filter(o => o.month_name === m);
      const income = sum(rows.filter(o => o.type === "Income").map(o => o.amount));
      const expense = sum(rows.filter(o => o.type === "Expense").map(o => o.amount));
      const net = income - expense;
      return { month_name: m, income, expense, net_cash_flow: net, savings_rate: income > 0 ? net / income : NaN };
    });
  }

  // ------------------------------------------------------------- utilities ----
  function sum(arr) { return arr.reduce((a, b) => a + b, 0); }
  function mean(arr) { return arr.length ? sum(arr) / arr.length : NaN; }
  function stddev(arr) {
    if (arr.length === 0) return NaN;
    const m = mean(arr);
    return Math.sqrt(mean(arr.map(x => (x - m) ** 2)));
  }
  function groupBy(arr, keyFn) {
    const map = new Map();
    arr.forEach(item => {
      const k = keyFn(item);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(item);
    });
    return map;
  }

  // ------------------------------------------------------------ spending analysis ----
  function expensesOnly(featured) { return featured.filter(o => o.type === "Expense"); }

  function categoryAnalysis(featured) {
    const exp = expensesOnly(featured);
    const total = sum(exp.map(o => o.amount));
    const groups = groupBy(exp, o => o.category);
    const rows = [];
    groups.forEach((items, cat) => {
      const amt = sum(items.map(o => o.amount));
      rows.push({
        category: cat, total_spent: amt, transactions: items.length,
        avg_transaction: amt / items.length, pct_of_total: total > 0 ? (amt / total) * 100 : 0,
      });
    });
    rows.sort((a, b) => b.total_spent - a.total_spent);
    return rows;
  }

  function merchantAnalysis(featured, topN) {
    topN = topN || 10;
    const exp = expensesOnly(featured);
    const groups = groupBy(exp, o => o.merchant);
    const rows = [];
    groups.forEach((items, merchant) => {
      const amt = sum(items.map(o => o.amount));
      rows.push({ merchant, total_spent: amt, transactions: items.length, avg_transaction: amt / items.length });
    });
    rows.sort((a, b) => b.total_spent - a.total_spent);
    return rows.slice(0, topN);
  }

  function monthlySpending(featured) {
    const months = orderedMonths(featured);
    const exp = expensesOnly(featured);
    const groups = groupBy(exp, o => o.month_name);
    return months.map(m => ({ month_name: m, total_spent: groups.has(m) ? sum(groups.get(m).map(o => o.amount)) : 0 }));
  }

  function weekdayWeekendSpending(featured) {
    const exp = expensesOnly(featured);
    const weekday = exp.filter(o => !o.is_weekend);
    const weekend = exp.filter(o => o.is_weekend);
    return [
      { label: "Weekday", total_spent: sum(weekday.map(o => o.amount)), avg_transaction: mean(weekday.map(o => o.amount)) || 0, transactions: weekday.length },
      { label: "Weekend", total_spent: sum(weekend.map(o => o.amount)), avg_transaction: mean(weekend.map(o => o.amount)) || 0, transactions: weekend.length },
    ];
  }

  function dayOfWeekPattern(featured) {
    const exp = expensesOnly(featured);
    const order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const groups = groupBy(exp, o => o.day_of_week);
    return order.map(d => ({ day_of_week: d, total_spent: groups.has(d) ? sum(groups.get(d).map(o => o.amount)) : 0 }));
  }

  function paymentMethodDistribution(featured) {
    const exp = expensesOnly(featured);
    const groups = groupBy(exp, o => o.payment_method);
    const rows = [];
    groups.forEach((items, pm) => rows.push({ payment_method: pm, total_spent: sum(items.map(o => o.amount)) }));
    rows.sort((a, b) => b.total_spent - a.total_spent);
    return rows;
  }

  function trendInsights(featured) {
    const months = orderedMonths(featured);
    if (months.length < 2) return { available: false, reason: "Not enough months of data (need at least 2) to compute trend changes." };
    const ms = monthlySpending(featured);
    const exp = expensesOnly(featured);
    const lastM = months[months.length - 1], prevM = months[months.length - 2];
    const lastGroups = groupBy(exp.filter(o => o.month_name === lastM), o => o.category);
    const prevGroups = groupBy(exp.filter(o => o.month_name === prevM), o => o.category);
    const cats = new Set([...lastGroups.keys(), ...prevGroups.keys()]);
    const changes = [];
    cats.forEach(c => {
      const lv = lastGroups.has(c) ? sum(lastGroups.get(c).map(o => o.amount)) : 0;
      const pv = prevGroups.has(c) ? sum(prevGroups.get(c).map(o => o.amount)) : 0;
      const pct = pv > 0 ? ((lv - pv) / pv) * 100 : (lv > 0 ? Infinity : 0);
      changes.push({ category: c, last_month: lv, prev_month: pv, pct_change: pct });
    });
    changes.sort((a, b) => b.pct_change - a.pct_change);
    const totalLast = ms.find(m => m.month_name === lastM).total_spent;
    const totalPrev = ms.find(m => m.month_name === prevM).total_spent;
    const overallPct = totalPrev > 0 ? ((totalLast - totalPrev) / totalPrev) * 100 : NaN;
    const peak = ms.reduce((a, b) => (b.total_spent > a.total_spent ? b : a));
    const low = ms.reduce((a, b) => (b.total_spent < a.total_spent ? b : a));
    return {
      available: true, last_month: lastM, prev_month: prevM, overall_pct_change: overallPct,
      increasing: changes.filter(c => c.pct_change > 0).slice(0, 5),
      decreasing: changes.filter(c => c.pct_change < 0).sort((a, b) => a.pct_change - b.pct_change).slice(0, 5),
      peak_month: peak.month_name, peak_amount: peak.total_spent,
      low_month: low.month_name, low_amount: low.total_spent,
    };
  }

  // ---------------------------------------------------------- anomaly detection ----
  function detectAnomalies(featured) {
    const exp = expensesOnly(featured).map(o => ({ ...o }));
    const catGroups = groupBy(exp, o => o.category);
    const allAmounts = exp.map(o => o.amount).sort((a, b) => a - b);
    const globalQ1 = quantile(allAmounts, 0.25), globalQ3 = quantile(allAmounts, 0.75);
    const globalThreshold = globalQ3 + 1.5 * (globalQ3 - globalQ1);

    catGroups.forEach((items) => {
      const amounts = items.map(o => o.amount).sort((a, b) => a - b);
      let threshold;
      if (items.length >= 8) {
        const q1 = quantile(amounts, 0.25), q3 = quantile(amounts, 0.75);
        threshold = q3 + 1.5 * (q3 - q1);
      } else {
        threshold = globalThreshold;
      }
      items.forEach(o => {
        o.anomaly_threshold = threshold;
        o.is_unusual = o.amount > threshold;
      });
    });

    const m = mean(exp.map(o => o.amount)), sd = stddev(exp.map(o => o.amount));
    exp.forEach(o => {
      o.z_score = sd > 0 ? (o.amount - m) / sd : 0;
      if (o.z_score > 2.5) o.is_unusual = true;
      o.anomaly_reason = o.is_unusual ? `Amount is significantly higher than typical ${o.category} spending` : "";
    });

    exp.sort((a, b) => b.amount - a.amount);
    return exp;
  }

  function anomalySummary(anomalyList) {
    const unusual = anomalyList.filter(o => o.is_unusual);
    return {
      count: unusual.length,
      total_amount: sum(unusual.map(o => o.amount)),
      pct_of_transactions: anomalyList.length ? (unusual.length / anomalyList.length) * 100 : 0,
      top: unusual.slice(0, 10),
    };
  }

  // ------------------------------------------------------------------- forecast ----
  function forecastNextMonth(monthlyDf) {
    const n = monthlyDf.length;
    if (n < 3) return { available: false, reason: `Only ${n} month(s) of data available — at least 3 months are needed for a reliable forecast.` };
    const y = monthlyDf.map(m => m.total_spent);
    const x = y.map((_, i) => i);
    const maWindow = Math.min(3, n);
    const movingAvg = mean(y.slice(-maWindow));

    const xMean = mean(x), yMean = mean(y);
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (x[i] - xMean) * (y[i] - yMean); den += (x[i] - xMean) ** 2; }
    const slope = den !== 0 ? num / den : 0;
    const intercept = yMean - slope * xMean;
    const lrForecast = Math.max(0, slope * n + intercept);
    const blended = (movingAvg + lrForecast) / 2;

    return {
      available: true,
      history_months: monthlyDf.map(m => m.month_name),
      history_values: y,
      moving_average_forecast: movingAvg,
      linear_trend_forecast: lrForecast,
      blended_forecast: blended,
      trend_slope: slope,
      trend_direction: slope > 5 ? "increasing" : (slope < -5 ? "decreasing" : "stable"),
    };
  }

  // ------------------------------------------------------------------- budgets ----
  function recommendCategoryBudgets(featured) {
    const months = orderedMonths(featured);
    const exp = expensesOnly(featured);
    const catGroups = groupBy(exp, o => o.category);
    const rows = [];
    catGroups.forEach((items, cat) => {
      const byMonth = groupBy(items, o => o.month_name);
      const series = months.map(m => byMonth.has(m) ? sum(byMonth.get(m).map(o => o.amount)) : 0);
      const avg = mean(series);
      const sd = stddev(series);
      rows.push({
        category: cat, avg_monthly_spend: avg, std_dev: sd,
        recommended_min: Math.max(avg - 0.1 * avg, 0),
        recommended_max: sd > 0 ? avg + 0.5 * sd : avg * 1.1,
        months_of_data: months.length,
      });
    });
    rows.sort((a, b) => b.avg_monthly_spend - a.avg_monthly_spend);
    return rows;
  }

  function compareBudgetToActual(actualByCategory, budgets) {
    const rows = [];
    for (const cat in budgets) {
      const budget = budgets[cat];
      const actual = actualByCategory[cat] || 0;
      const pct = budget > 0 ? (actual / budget) * 100 : NaN;
      let status;
      if (isNaN(pct)) status = "No Budget Set";
      else if (pct <= 80) status = "Within Budget";
      else if (pct <= 100) status = "Near Limit";
      else status = "Over Budget";
      rows.push({ category: cat, budget, actual, pct_used: pct, status });
    }
    rows.sort((a, b) => (isNaN(b.pct_used) ? -1 : b.pct_used) - (isNaN(a.pct_used) ? -1 : a.pct_used));
    return rows;
  }

  const STATUS_ICON = { "Within Budget": "🟢", "Near Limit": "🟡", "Over Budget": "🔴", "No Budget Set": "⚪" };

  // --------------------------------------------------------- financial score ----
  function computeFinancialHealthScore(featured, monthlyCf, anomalySumm, hasIncome) {
    const breakdown = {};
    const weights = {};

    if (hasIncome && monthlyCf.length > 0 && sum(monthlyCf.map(m => m.income)) > 0) {
      const rates = monthlyCf.map(m => m.savings_rate).filter(v => !isNaN(v));
      const avgRate = mean(rates);
      const score = clip((avgRate / 0.30) * 100, 0, 100);
      breakdown["Savings"] = { score: Math.round(score), detail: `Average savings rate: ${(avgRate * 100).toFixed(1)}%` };
      weights["Savings"] = 0.35;
    } else {
      breakdown["Savings"] = { score: null, detail: "Not applicable — no income data was provided." };
    }

    if (monthlyCf.length >= 2) {
      const expenses = monthlyCf.map(m => m.expense);
      const cv = mean(expenses) > 0 ? stddev(expenses) / mean(expenses) : NaN;
      const score = !isNaN(cv) ? clip(100 - cv * 150, 0, 100) : null;
      breakdown["Spending Stability"] = {
        score: score !== null ? Math.round(score) : null,
        detail: !isNaN(cv) ? `Month-to-month spending variability (CV): ${cv.toFixed(2)}` : "Not enough months of data.",
      };
      if (score !== null) weights["Spending Stability"] = 0.25;
    } else {
      breakdown["Spending Stability"] = { score: null, detail: "Not applicable — need at least 2 months of data." };
    }

    const pctUnusual = anomalySumm.pct_of_transactions || 0;
    const anomalyScore = clip(100 - pctUnusual * 8, 0, 100);
    breakdown["Spending Consistency"] = {
      score: Math.round(anomalyScore),
      detail: `${anomalySumm.count || 0} unusual transactions found (${pctUnusual.toFixed(1)}% of all transactions).`,
    };
    weights["Spending Consistency"] = 0.20;

    const exp = expensesOnly(featured);
    const discretionaryCats = new Set(["Shopping", "Entertainment", "Travel", "Personal Care"]);
    const discAmt = sum(exp.filter(o => discretionaryCats.has(o.category)).map(o => o.amount));
    const totalAmt = sum(exp.map(o => o.amount));
    const discRatio = totalAmt > 0 ? discAmt / totalAmt : 0;
    const discScore = clip(100 - discRatio * 200, 0, 100);
    breakdown["Discretionary Spending"] = {
      score: Math.round(discScore),
      detail: `Discretionary categories (Shopping, Entertainment, Travel, Personal Care) make up ${(discRatio * 100).toFixed(1)}% of total spending.`,
    };
    weights["Discretionary Spending"] = 0.20;

    const totalW = sum(Object.values(weights));
    let overall = 0;
    for (const k in weights) {
      const s = breakdown[k].score;
      if (s !== null) overall += s * (weights[k] / totalW);
    }
    return { overall_score: Math.round(overall), breakdown };
  }

  function clip(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ------------------------------------------------------------------ insights ----
  function detectRecurringExpenses(featured) {
    const months = orderedMonths(featured);
    const nMonthsTotal = months.length;
    if (nMonthsTotal < 2) return [];
    const exp = expensesOnly(featured);
    const groups = groupBy(exp, o => o.merchant + "||" + o.category);
    const rows = [];
    groups.forEach((items, key) => {
      const [merchant, category] = key.split("||");
      const monthsPresent = new Set(items.map(o => o.month_name)).size;
      const coverage = monthsPresent / nMonthsTotal;
      if (items.length < 2) return;
      const amounts = items.map(o => o.amount);
      const cv = mean(amounts) > 0 ? stddev(amounts) / mean(amounts) : Infinity;
      if (coverage >= 0.5 && cv < 0.25) {
        let freqLabel;
        if (monthsPresent >= nMonthsTotal * 0.9) freqLabel = "Monthly";
        else if (monthsPresent >= nMonthsTotal * 0.4) freqLabel = "Frequent (not every month)";
        else freqLabel = "Occasional";
        rows.push({ merchant, category, frequency: freqLabel, approx_monthly_amount: mean(amounts), months_seen: monthsPresent, total_months: nMonthsTotal });
      }
    });
    rows.sort((a, b) => b.approx_monthly_amount - a.approx_monthly_amount);
    return rows;
  }

  function generateInsights(catA, trend, anomalySumm, monthlyCf, hasIncome) {
    const insights = [];
    if (catA.length > 0) {
      const top = catA[0];
      insights.push({ type: "spending", icon: "💡", text: `${top.category} accounts for ${top.pct_of_total.toFixed(0)}% of your total spending (₹${fmt(top.total_spent)} across ${top.transactions} transactions).` });
    }
    if (trend.available) {
      if (!isNaN(trend.overall_pct_change) && isFinite(trend.overall_pct_change)) {
        const direction = trend.overall_pct_change > 0 ? "increased" : "decreased";
        insights.push({ type: "trend", icon: "📈", text: `Your spending ${direction} by ${Math.abs(trend.overall_pct_change).toFixed(0)}% in ${trend.last_month} compared with ${trend.prev_month}.` });
      }
      insights.push({ type: "trend", icon: "📊", text: `Peak spending month: ${trend.peak_month} (₹${fmt(trend.peak_amount)}). Lowest spending month: ${trend.low_month} (₹${fmt(trend.low_amount)}).` });
    }
    if (anomalySumm.count > 0) {
      insights.push({ type: "alert", icon: "🚨", text: `${anomalySumm.count} transactions were identified as unusually large, totaling ₹${fmt(anomalySumm.total_amount)} (${anomalySumm.pct_of_transactions.toFixed(1)}% of all transactions).` });
    }
    if (hasIncome && monthlyCf.length > 0 && sum(monthlyCf.map(m => m.income)) > 0) {
      const rates = monthlyCf.map(m => m.savings_rate).filter(v => !isNaN(v));
      if (rates.length) insights.push({ type: "savings", icon: "💰", text: `Your average savings rate is ${(mean(rates) * 100).toFixed(0)}% of income across ${monthlyCf.length} month(s) of data.` });
    }
    if (catA.length >= 2) {
      const bottom = catA[catA.length - 1];
      insights.push({ type: "spending", icon: "📉", text: `${bottom.category} is your lowest spending category at ₹${fmt(bottom.total_spent)} (${bottom.pct_of_total.toFixed(1)}% of total).` });
    }
    return insights;
  }

  function generateRecommendations(catA, trend, anomalySumm, recurringRows, monthlyCf, hasIncome, financialScore) {
    const recs = [];
    const nMonths = Math.max(1, monthlyCf.length);
    if (catA.length > 0) {
      const top = catA[0];
      recs.push({ icon: "🎯", text: `Consider setting a monthly ${top.category} budget close to your historical average of roughly ₹${fmt(top.total_spent / nMonths)}/month, since it is your largest spending category at ${top.pct_of_total.toFixed(0)}% of the total.` });
    }
    if (trend.available && trend.increasing.length > 0) {
      const row = trend.increasing[0];
      if (isFinite(row.pct_change) && row.pct_change > 15) {
        recs.push({ icon: "⚠️", text: `${row.category} spending increased by ${row.pct_change.toFixed(0)}% in ${trend.last_month} vs ${trend.prev_month} — review your largest recent ${row.category} transactions.` });
      }
    }
    if (anomalySumm.count > 0) {
      recs.push({ icon: "🚨", text: `${anomalySumm.count} unusually large transactions were found totaling ₹${fmt(anomalySumm.total_amount)}. Reviewing these first is the fastest way to understand any unplanned spending.` });
    }
    if (recurringRows && recurringRows.length > 0) {
      const recurringTotal = sum(recurringRows.map(r => r.approx_monthly_amount));
      const expTotalMonthly = sum(catA.map(c => c.total_spent)) / nMonths;
      if (expTotalMonthly > 0) {
        const pct = (recurringTotal / expTotalMonthly) * 100;
        if (pct > 15) recs.push({ icon: "🔁", text: `Recurring expenses (subscriptions, rent, bills) total approximately ₹${fmt(recurringTotal)}/month — about ${pct.toFixed(0)}% of your average monthly spending. Review these for any unused subscriptions.` });
      }
    }
    if (trend.available && !isNaN(trend.overall_pct_change) && isFinite(trend.overall_pct_change) && Math.abs(trend.overall_pct_change) < 10) {
      recs.push({ icon: "✅", text: "Your spending pattern is relatively consistent across recent months — a good foundation for setting a stable monthly budget." });
    }
    if (hasIncome && financialScore.breakdown["Savings"] && financialScore.breakdown["Savings"].score !== null) {
      const sscore = financialScore.breakdown["Savings"].score;
      if (sscore < 60) {
        const discretionaryCats = new Set(["Shopping", "Entertainment", "Travel", "Personal Care"]);
        const disc = sum(catA.filter(c => discretionaryCats.has(c.category)).map(c => c.total_spent));
        const suggestedCut = (disc / nMonths) * 0.20;
        if (suggestedCut > 0) recs.push({ icon: "🎯", text: `Reducing discretionary spending (Shopping, Entertainment, Travel, Personal Care) by roughly ₹${fmt(suggestedCut)}/month could meaningfully improve your savings rate.` });
      }
    }
    if (recs.length === 0) recs.push({ icon: "ℹ️", text: "Upload more transaction history for more specific, data-driven recommendations." });
    return recs;
  }

  function fmt(n) {
    if (n === undefined || n === null || isNaN(n)) return "0";
    return Math.round(n).toLocaleString("en-IN");
  }

  // ------------------------------------------------------------------- exports ----
  return {
    parseCSV, detectColumns, validateData, cleanTransactions, addFeatures,
    orderedMonths, hasIncomeData, monthlyCashFlow,
    categoryAnalysis, merchantAnalysis, monthlySpending, weekdayWeekendSpending,
    dayOfWeekPattern, paymentMethodDistribution, trendInsights,
    detectAnomalies, anomalySummary,
    forecastNextMonth,
    recommendCategoryBudgets, compareBudgetToActual, STATUS_ICON,
    computeFinancialHealthScore,
    detectRecurringExpenses, generateInsights, generateRecommendations,
    fmt, sum, mean, stddev, quantile,
  };
});
