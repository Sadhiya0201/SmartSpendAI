/*
  app.js — UI layer for SmartSpend AI. All calculation logic lives in
  engine.js (window.SmartSpendEngine); this file only touches the DOM,
  wires up events, and renders Chart.js charts.
*/
(function () {
  "use strict";
  const E = window.SmartSpendEngine;
  const TEAL = "#0F766E", CORAL = "#E85D42", AMBER = "#C8811A";
  const CHART_COLORS = [TEAL, CORAL, AMBER, "#3B6FA0", "#7B5EA7", "#4B8F6B", "#B94A4A", "#6B7A76", "#C4933D", "#4E6E8C"];

  const state = {
    detected: {}, unmatched: [], rawRows: [], headers: [],
    featured: null, hasIncome: false, monthlyCf: null, cleaningLog: null,
    catA: null, ms: null, anomalyList: null, asum: null,
    budgets: {}, monthlyIncome: 0, recBudgets: null, budgetCmp: null,
    charts: {}, filters: {},
  };

  // ------------------------------------------------------------ helpers ----
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const money = n => "\u20B9" + E.fmt(n);

  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k === "text") e.textContent = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(c => c && e.appendChild(c));
    return e;
  }

  // ------------------------------------------------------------ ledger tape preview ----
  function initLedgerTapePreview() {
    const track = $("#ledgerTapeTrack");
    const sampleRows = E.parseCSV(SMARTSPEND_DEMO_CSV).slice(0, 14);
    const items = sampleRows.map(r => {
      const merchant = r["Merchant"] || r["Description"] || "\u2014";
      const amt = r["Amount"] || "0";
      return `<span class="tape-item">${merchant}<span class="tape-amt">\u20B9${Number(amt).toLocaleString("en-IN")}</span></span>`;
    });
    track.innerHTML = items.join("") + items.join(""); // duplicate for seamless loop
  }

  // ============================================================ FILE INTAKE ====
  function initIntake() {
    const dropzone = $("#dropzone");
    const fileInput = $("#fileInput");

    ["dragenter", "dragover"].forEach(ev => dropzone.addEventListener(ev, e => {
      e.preventDefault(); dropzone.classList.add("dragover");
    }));
    ["dragleave", "drop"].forEach(ev => dropzone.addEventListener(ev, e => {
      e.preventDefault(); dropzone.classList.remove("dragover");
    }));
    dropzone.addEventListener("drop", e => {
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    });
    fileInput.addEventListener("change", e => {
      const f = e.target.files[0];
      if (f) handleFile(f);
    });

    $("#demoBtn").addEventListener("click", () => {
      const rows = E.parseCSV(SMARTSPEND_DEMO_CSV);
      loadRows(rows);
    });

    $("#confirmMappingBtn").addEventListener("click", confirmMapping);
    $("#loadDifferentBtn").addEventListener("click", resetToHome);
  }

  function showFileError(msg) {
    const box = $("#fileError");
    box.textContent = "\u26A0\uFE0F " + msg;
    box.classList.remove("hidden");
  }
  function hideFileError() { $("#fileError").classList.add("hidden"); }

  function handleFile(file) {
    hideFileError();
    const name = file.name.toLowerCase();
    if (name.endsWith(".csv")) {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const rows = E.parseCSV(e.target.result);
          if (!rows.length) { showFileError("The uploaded file appears to be empty. Please upload a file that contains transaction rows."); return; }
          loadRows(rows);
        } catch (err) {
          showFileError("We couldn't read this file. Please upload a valid CSV or Excel (.xlsx) file.");
        }
      };
      reader.onerror = () => showFileError("We couldn't read this file. Please try again.");
      reader.readAsText(file);
    } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, { type: "array" });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
          if (!json.length) { showFileError("The uploaded file appears to be empty. Please upload a file that contains transaction rows."); return; }
          loadRows(json);
        } catch (err) {
          showFileError("We couldn't read this file. Please upload a valid CSV or Excel (.xlsx) file.");
        }
      };
      reader.onerror = () => showFileError("We couldn't read this file. Please try again.");
      reader.readAsArrayBuffer(file);
    } else {
      showFileError("Please upload a .csv or .xlsx file.");
    }
  }

  function loadRows(rows) {
    if (!rows.length || Object.keys(rows[0]).length < 2) {
      showFileError("This file doesn't look like a transaction table (fewer than 2 columns detected).");
      return;
    }
    state.rawRows = rows;
    state.headers = Object.keys(rows[0]);
    const { detected, unmatched } = E.detectColumns(state.headers);
    state.detected = detected; state.unmatched = unmatched;

    if (unmatched.length) {
      showMappingPanel();
    } else {
      finalizeLoad(detected);
    }
  }

  const ROLE_LABELS = {
    date: "Date column", amount: "Amount column", category: "Category column",
    merchant: "Merchant / description column", payment_method: "Payment method column",
    type: "Type (Income/Expense) column", transaction_id: "Transaction ID column",
  };

  function showMappingPanel() {
    const panel = $("#mappingPanel");
    const fieldsBox = $("#mappingFields");
    fieldsBox.innerHTML = "";
    Object.keys(ROLE_LABELS).forEach(role => {
      const field = el("div", { class: "mapping-field" });
      field.appendChild(el("label", { text: ROLE_LABELS[role] }));
      const select = el("select", { "data-role": role });
      select.appendChild(el("option", { value: "", text: "(none)" }));
      state.headers.forEach(h => {
        const opt = el("option", { value: h, text: h });
        if (state.detected[role] === h) opt.selected = true;
        select.appendChild(opt);
      });
      field.appendChild(select);
      fieldsBox.appendChild(field);
    });
    panel.classList.remove("hidden");
    if (state.unmatched.length) {
      showFileError("We couldn't automatically identify every required column (" + state.unmatched.join(", ") + "). Please confirm the mapping below.");
    }
  }

  function confirmMapping() {
    const mapping = {};
    $$("#mappingFields select").forEach(sel => {
      const role = sel.getAttribute("data-role");
      if (sel.value) mapping[role] = sel.value;
    });
    if (!mapping.date || !mapping.amount) {
      showFileError("We couldn't identify a transaction date and/or amount column. Please select them above.");
      return;
    }
    hideFileError();
    $("#mappingPanel").classList.add("hidden");
    finalizeLoad(mapping);
  }

  function finalizeLoad(mapping) {
    const validation = E.validateData(state.rawRows, mapping);
    renderQualityPanel(validation);
    if (validation.criticalError) {
      showFileError(validation.criticalError);
      return;
    }
    const { cleaned, log } = E.cleanTransactions(state.rawRows, mapping);
    if (!cleaned.length) {
      showFileError("After cleaning, no valid transactions remained. Please check your date and amount columns.");
      return;
    }
    state.cleaningLog = log;
    state.featured = E.addFeatures(cleaned);
    state.hasIncome = E.hasIncomeData(state.featured);
    state.monthlyCf = E.monthlyCashFlow(state.featured);
    recomputeCore();
    showApp();
  }

  function renderQualityPanel(validation) {
    const panel = $("#qualityPanel");
    const list = $("#qualityList");
    list.innerHTML = "";
    validation.messages.forEach(([level, msg]) => {
      const icon = level === "ok" ? "\u2713" : (level === "warn" ? "\u26A0" : "\u2139");
      const cls = level === "ok" ? "q-ok" : (level === "warn" ? "q-warn" : "q-info");
      list.appendChild(el("li", {}, [el("span", { class: cls, text: icon }), document.createTextNode(" " + msg)]));
    });
    panel.classList.remove("hidden");
  }

  function renderCleaningSteps() {
    if (!state.cleaningLog) return;
    const details = $("#cleaningDetails");
    const list = $("#cleaningStepsList");
    list.innerHTML = "";
    state.cleaningLog.steps.forEach(step => list.appendChild(el("li", { text: step })));
    details.classList.remove("hidden");
  }

  function resetToHome() {
    Object.values(state.charts).forEach(c => c && c.destroy());
    state.charts = {};
    state.featured = null; state.budgets = {}; state.monthlyIncome = 0;
    $("#page-app").classList.add("hidden");
    $("#page-home").classList.remove("hidden");
    $("#mainNav").classList.add("hidden");
    $("#loadedBadge").classList.add("hidden");
    $("#loadDifferentBtn").classList.add("hidden");
    $("#qualityPanel").classList.add("hidden");
    $("#mappingPanel").classList.add("hidden");
    $("#fileInput").value = "";
    hideFileError();
  }

  // ============================================================ CORE RECOMPUTE ====
  function recomputeCore() {
    state.catA = E.categoryAnalysis(state.featured);
    state.ms = E.monthlySpending(state.featured);
    state.anomalyList = E.detectAnomalies(state.featured);
    state.asum = E.anomalySummary(state.anomalyList);
    state.trend = E.trendInsights(state.featured);
    state.fc = E.forecastNextMonth(state.ms);
    state.recBudgets = E.recommendCategoryBudgets(state.featured);
    state.recurring = E.detectRecurringExpenses(state.featured);
    state.fscore = E.computeFinancialHealthScore(state.featured, state.monthlyCf, state.asum, state.hasIncome);
    state.insights = E.generateInsights(state.catA, state.trend, state.asum, state.monthlyCf, state.hasIncome);
    state.recommendations = E.generateRecommendations(state.catA, state.trend, state.asum, state.recurring, state.monthlyCf, state.hasIncome, state.fscore);
  }

  function showApp() {
    renderCleaningSteps();
    $("#page-home").classList.add("hidden");
    $("#page-app").classList.remove("hidden");
    $("#mainNav").classList.remove("hidden");
    const badge = $("#loadedBadge");
    badge.textContent = state.featured.length.toLocaleString() + " transactions loaded";
    badge.classList.remove("hidden");
    $("#loadDifferentBtn").classList.remove("hidden");
    renderAllViews();
    navigateTo("dashboard");
  }

  function renderAllViews() {
    renderDashboard();
    renderTransactions();
    renderAnalysis();
    renderAnomalies();
    renderForecast();
    renderBudget();
    renderInsights();
    renderReportsPreview();
  }

  // ============================================================ NAVIGATION ====
  function initNav() {
    $$(".nav-item").forEach(btn => {
      btn.addEventListener("click", () => navigateTo(btn.getAttribute("data-page")));
    });
  }
  function navigateTo(page) {
    $$(".nav-item").forEach(b => b.classList.toggle("active", b.getAttribute("data-page") === page));
    $$(".view").forEach(v => v.classList.add("hidden"));
    const view = $("#view-" + page);
    if (view) view.classList.remove("hidden");
  }

  // ============================================================ DASHBOARD ====
  function destroyChart(key) { if (state.charts[key]) { state.charts[key].destroy(); delete state.charts[key]; } }

  function renderDashboard() {
    const f = state.featured;
    const exp = f.filter(o => o.type === "Expense");
    const totalSpend = E.sum(exp.map(o => o.amount));
    const nMonths = E.orderedMonths(f).length || 1;
    const monthlyAvg = totalSpend / nMonths;
    const avgTxn = E.mean(exp.map(o => o.amount)) || 0;
    const topCat = state.catA.length ? state.catA[0].category : "N/A";

    const kpis = [
      { label: "Total spending", value: money(totalSpend), accent: "" },
      { label: "Monthly average", value: money(monthlyAvg), accent: "" },
      { label: "Average transaction", value: money(avgTxn), accent: "" },
      { label: "Top category", value: topCat, accent: "coral" },
      { label: "Transactions", value: f.length.toLocaleString(), accent: "" },
      { label: "Unusual transactions", value: state.asum.count, accent: "amber" },
    ];
    if (state.hasIncome) {
      const totalIncome = E.sum(f.filter(o => o.type === "Income").map(o => o.amount));
      const rates = state.monthlyCf.map(m => m.savings_rate).filter(v => !isNaN(v));
      const avgSr = rates.length ? E.mean(rates) : NaN;
      kpis.push({ label: "Total income", value: money(totalIncome), accent: "coral" });
      kpis.push({ label: "Savings rate", value: isNaN(avgSr) ? "N/A" : Math.round(avgSr * 100) + "%", accent: "coral" });
    } else {
      kpis.push({ label: "Total income", value: "Not available", accent: "" });
    }

    const grid = $("#kpiGrid");
    grid.innerHTML = "";
    kpis.forEach(k => {
      grid.appendChild(el("div", { class: "kpi-card" + (k.accent ? " accent-" + k.accent : "") }, [
        el("div", { class: "kpi-label", text: k.label }),
        el("div", { class: "kpi-value", text: String(k.value) }),
      ]));
    });

    // charts
    Object.keys(state.charts).forEach(destroyChart);

    state.charts.monthlyTrend = new Chart($("#chartMonthlyTrend"), {
      type: "line",
      data: { labels: state.ms.map(m => m.month_name), datasets: [{ label: "Spending", data: state.ms.map(m => m.total_spent), borderColor: TEAL, backgroundColor: "rgba(15,118,110,0.08)", fill: true, tension: 0.25 }] },
      options: baseChartOpts(),
    });

    state.charts.categoryPie = new Chart($("#chartCategoryPie"), {
      type: "doughnut",
      data: { labels: state.catA.map(c => c.category), datasets: [{ data: state.catA.map(c => c.total_spent), backgroundColor: CHART_COLORS }] },
      options: { plugins: { legend: { position: "right", labels: { boxWidth: 10, font: { size: 11 } } } } },
    });

    state.charts.monthlyBar = new Chart($("#chartMonthlyBar"), {
      type: "bar",
      data: { labels: state.ms.map(m => m.month_name), datasets: [{ label: "Spending", data: state.ms.map(m => m.total_spent), backgroundColor: TEAL, borderRadius: 2 }] },
      options: baseChartOpts(),
    });

    const wk = E.weekdayWeekendSpending(f);
    state.charts.weekdayWeekend = new Chart($("#chartWeekdayWeekend"), {
      type: "bar",
      data: { labels: wk.map(w => w.label), datasets: [{ data: wk.map(w => w.total_spent), backgroundColor: [TEAL, CORAL], borderRadius: 2 }] },
      options: Object.assign({}, baseChartOpts(), { plugins: { legend: { display: false } } }),
    });

    const pm = E.paymentMethodDistribution(f);
    state.charts.paymentMethod = new Chart($("#chartPaymentMethod"), {
      type: "pie",
      data: { labels: pm.map(p => p.payment_method), datasets: [{ data: pm.map(p => p.total_spent), backgroundColor: CHART_COLORS }] },
      options: { plugins: { legend: { position: "right", labels: { boxWidth: 10, font: { size: 11 } } } } },
    });

    const merch = E.merchantAnalysis(f, 10);
    state.charts.topMerchants = new Chart($("#chartTopMerchants"), {
      type: "bar",
      data: { labels: merch.map(m => m.merchant), datasets: [{ data: merch.map(m => m.total_spent), backgroundColor: TEAL, borderRadius: 2 }] },
      options: Object.assign({}, baseChartOpts(), { indexAxis: "y", plugins: { legend: { display: false } } }),
    });

    state.charts.histogram = new Chart($("#chartHistogram"), buildHistogramConfig(exp.map(o => o.amount)));
  }

  function baseChartOpts() {
    return {
      plugins: { legend: { display: false } },
      scales: { y: { ticks: { font: { size: 10 } } }, x: { ticks: { font: { size: 10 } } } },
      maintainAspectRatio: true,
    };
  }

  function buildHistogramConfig(amounts) {
    const nbins = 24;
    if (!amounts.length) return { type: "bar", data: { labels: [], datasets: [] } };
    const min = Math.min.apply(null, amounts), max = Math.max.apply(null, amounts);
    const width = (max - min) / nbins || 1;
    const bins = new Array(nbins).fill(0);
    amounts.forEach(a => {
      let idx = Math.floor((a - min) / width);
      if (idx >= nbins) idx = nbins - 1;
      if (idx < 0) idx = 0;
      bins[idx]++;
    });
    const labels = bins.map((_, i) => "\u20B9" + E.fmt(min + i * width));
    return {
      type: "bar",
      data: { labels, datasets: [{ data: bins, backgroundColor: TEAL, borderRadius: 1 }] },
      options: Object.assign({}, baseChartOpts(), { scales: { x: { ticks: { maxRotation: 60, minRotation: 60, font: { size: 8 } } }, y: { ticks: { font: { size: 10 } } } } }),
    };
  }

  // ============================================================ TRANSACTIONS ====
  function renderTransactions() {
    const f = state.featured;
    const dates = f.map(o => o.date);
    const minD = new Date(Math.min.apply(null, dates)), maxD = new Date(Math.max.apply(null, dates));
    $("#filterDateFrom").value = minD.toISOString().slice(0, 10);
    $("#filterDateTo").value = maxD.toISOString().slice(0, 10);

    fillMultiSelect("#filterCategory", uniqueSorted(f.map(o => o.category)));
    fillMultiSelect("#filterMerchant", uniqueSorted(f.map(o => o.merchant)));
    fillMultiSelect("#filterPayment", uniqueSorted(f.map(o => o.payment_method)));

    const amounts = f.map(o => o.amount);
    const maxAmt = Math.ceil(Math.max.apply(null, amounts));
    $("#filterAmountMin").max = maxAmt; $("#filterAmountMin").value = 0;
    $("#filterAmountMax").max = maxAmt; $("#filterAmountMax").value = maxAmt;
    updateAmountLabel();

    ["#filterDateFrom", "#filterDateTo", "#filterCategory", "#filterMerchant", "#filterPayment", "#filterAmountMin", "#filterAmountMax"]
      .forEach(sel => $(sel).addEventListener("input", () => { updateAmountLabel(); applyTransactionFilters(); }));

    $("#resetFiltersBtn").addEventListener("click", () => {
      $("#filterDateFrom").value = minD.toISOString().slice(0, 10);
      $("#filterDateTo").value = maxD.toISOString().slice(0, 10);
      $$("#filterCategory option, #filterMerchant option, #filterPayment option").forEach(o => o.selected = false);
      $("#filterAmountMin").value = 0; $("#filterAmountMax").value = maxAmt;
      updateAmountLabel();
      applyTransactionFilters();
    });

    $("#downloadCsvBtn").addEventListener("click", downloadFilteredCsv);

    applyTransactionFilters();
  }

  function uniqueSorted(arr) { return Array.from(new Set(arr)).sort(); }
  function fillMultiSelect(sel, values) {
    const target = $(sel);
    target.innerHTML = "";
    values.forEach(v => target.appendChild(el("option", { value: v, text: v })));
  }
  function updateAmountLabel() {
    $("#amountRangeLabel").textContent = money($("#filterAmountMin").value) + " \u2013 " + money($("#filterAmountMax").value);
  }
  function selectedValues(sel) { return $$(`${sel} option`).filter(o => o.selected).map(o => o.value); }

  function applyTransactionFilters() {
    const from = new Date($("#filterDateFrom").value);
    const to = new Date($("#filterDateTo").value);
    to.setHours(23, 59, 59, 999);
    const cats = selectedValues("#filterCategory");
    const merchs = selectedValues("#filterMerchant");
    const pays = selectedValues("#filterPayment");
    const amtMin = Number($("#filterAmountMin").value);
    const amtMax = Number($("#filterAmountMax").value);

    const unusualIds = new Set(state.anomalyList.filter(o => o.is_unusual).map(o => o.transaction_id));

    const filtered = state.featured.filter(o => {
      if (o.date < from || o.date > to) return false;
      if (cats.length && !cats.includes(o.category)) return false;
      if (merchs.length && !merchs.includes(o.merchant)) return false;
      if (pays.length && !pays.includes(o.payment_method)) return false;
      if (o.amount < amtMin || o.amount > amtMax) return false;
      return true;
    }).sort((a, b) => b.date - a.date);

    state.filteredTxns = filtered;
    $("#filterCount").textContent = filtered.length.toLocaleString() + " transactions match your filters";

    const tbody = $("#txnTableBody");
    tbody.innerHTML = "";
    filtered.slice(0, 500).forEach(o => {
      const isUnusual = unusualIds.has(o.transaction_id);
      tbody.appendChild(el("tr", {}, [
        el("td", { text: o.transaction_id }),
        el("td", { text: o.date.toISOString().slice(0, 10) }),
        el("td", { text: o.merchant }),
        el("td", { text: o.category }),
        el("td", { class: "num", text: money(o.amount) }),
        el("td", { text: o.payment_method }),
        el("td", { text: o.type }),
        el("td", {}, isUnusual ? [el("span", { class: "flag-unusual", text: "UNUSUAL" })] : []),
      ]));
    });
    if (filtered.length > 500) {
      const tr = el("tr", {}, [el("td", { colspan: "8", text: `\u2026and ${filtered.length - 500} more rows (showing first 500; download CSV for the full set)` })]);
      tr.lastChild.style.color = "#6B7A76";
      tr.lastChild.style.fontStyle = "italic";
      tbody.appendChild(tr);
    }
  }

  function downloadFilteredCsv() {
    const rows = state.filteredTxns || [];
    const header = ["transaction_id", "date", "merchant", "category", "amount", "payment_method", "type"];
    const lines = [header.join(",")];
    rows.forEach(o => {
      const vals = [o.transaction_id, o.date.toISOString().slice(0, 10), csvEscape(o.merchant), csvEscape(o.category), o.amount, csvEscape(o.payment_method), o.type];
      lines.push(vals.join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    triggerDownload(blob, "filtered_transactions.csv");
  }
  function csvEscape(s) { s = String(s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: filename });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ============================================================ SPENDING ANALYSIS ====
  function initAnalysisTabs() {
    $$("#analysisTabs .tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        $$("#analysisTabs .tab-btn").forEach(b => b.classList.toggle("active", b === btn));
        $$(".tab-panel").forEach(p => p.classList.add("hidden"));
        $("#tab-" + btn.getAttribute("data-tab")).classList.remove("hidden");
      });
    });
  }

  function renderAnalysis() {
    const f = state.featured;

    // Category tab
    const catPanel = $("#tab-category");
    catPanel.innerHTML = "";
    const catTable = buildSimpleTable(
      ["Category", "Total Spent", "Transactions", "Avg Transaction", "% of Total"],
      state.catA.map(c => [c.category, money(c.total_spent), c.transactions, money(c.avg_transaction), c.pct_of_total.toFixed(1) + "%"])
    );
    catPanel.appendChild(catTable);
    if (state.catA.length) {
      const top = state.catA[0], bottom = state.catA[state.catA.length - 1];
      catPanel.appendChild(el("div", { class: "callout", text: `Highest spending category: ${top.category} (${money(top.total_spent)}) \u00B7 Lowest: ${bottom.category} (${money(bottom.total_spent)})` }));
    }

    // Merchant tab
    const merchPanel = $("#tab-merchant");
    merchPanel.innerHTML = "";
    const merch = E.merchantAnalysis(f, 15);
    merchPanel.appendChild(buildSimpleTable(
      ["Merchant", "Total Spent", "Transactions", "Avg Transaction"],
      merch.map(m => [m.merchant, money(m.total_spent), m.transactions, money(m.avg_transaction)])
    ));

    // Time patterns tab
    const timePanel = $("#tab-time");
    timePanel.innerHTML = "";
    const dow = E.dayOfWeekPattern(f);
    const dowCanvas = el("canvas", { id: "chartDow" });
    const dowCard = el("div", { class: "chart-card" }, [el("h3", { text: "Day-of-week spending pattern" }), dowCanvas]);
    timePanel.appendChild(dowCard);
    const wk = E.weekdayWeekendSpending(f);
    const wkHeading = el("h3", { text: "Weekday vs weekend" });
    wkHeading.style.fontFamily = "var(--font-display)";
    wkHeading.style.marginTop = "20px";
    timePanel.appendChild(wkHeading);
    timePanel.appendChild(buildSimpleTable(["Period", "Total Spent", "Avg Transaction", "Transactions"], wk.map(w => [w.label, money(w.total_spent), money(w.avg_transaction), w.transactions])));
    destroyChart("dow");
    state.charts.dow = new Chart(dowCanvas, {
      type: "bar",
      data: { labels: dow.map(d => d.day_of_week), datasets: [{ data: dow.map(d => d.total_spent), backgroundColor: TEAL, borderRadius: 2 }] },
      options: baseChartOpts(),
    });

    // Trend tab
    const trendPanel = $("#tab-trend");
    trendPanel.innerHTML = "";
    const trend = state.trend;
    if (!trend.available) {
      trendPanel.appendChild(el("p", { class: "view-note", text: trend.reason }));
    } else {
      const direction = trend.overall_pct_change > 0 ? "increased \uD83D\uDCC8" : "decreased \uD83D\uDCC9";
      trendPanel.appendChild(el("p", { html: `Overall spending <strong>${direction} by ${Math.abs(trend.overall_pct_change).toFixed(1)}%</strong> in <strong>${trend.last_month}</strong> vs <strong>${trend.prev_month}</strong>.` }));
      const grid = el("div", {});
      grid.style.display = "grid"; grid.style.gridTemplateColumns = "1fr 1fr"; grid.style.gap = "20px"; grid.style.margin = "16px 0";
      const incHeading = el("h4", { text: "Increasing categories" });
      incHeading.style.fontFamily = "var(--font-display)"; incHeading.style.margin = "0 0 8px";
      const incBox = el("div", {}, [incHeading]);
      if (trend.increasing.length) incBox.appendChild(buildSimpleTable(["Category", "Change"], trend.increasing.map(c => [c.category, (isFinite(c.pct_change) ? (c.pct_change >= 0 ? "+" : "") + c.pct_change.toFixed(1) : "New") + "%"])));
      else { const p = el("p", { text: "No categories increased." }); p.style.color = "var(--text-muted)"; p.style.fontSize = "13px"; incBox.appendChild(p); }
      const decHeading = el("h4", { text: "Decreasing categories" });
      decHeading.style.fontFamily = "var(--font-display)"; decHeading.style.margin = "0 0 8px";
      const decBox = el("div", {}, [decHeading]);
      if (trend.decreasing.length) decBox.appendChild(buildSimpleTable(["Category", "Change"], trend.decreasing.map(c => [c.category, c.pct_change.toFixed(1) + "%"])));
      else { const p = el("p", { text: "No categories decreased." }); p.style.color = "var(--text-muted)"; p.style.fontSize = "13px"; decBox.appendChild(p); }
      grid.appendChild(incBox); grid.appendChild(decBox);
      trendPanel.appendChild(grid);
      trendPanel.appendChild(el("div", { class: "callout", text: `Peak spending month: ${trend.peak_month} (${money(trend.peak_amount)}) \u00B7 Lowest spending month: ${trend.low_month} (${money(trend.low_amount)})` }));
    }
  }

  function buildSimpleTable(headers, rows) {
    const table = el("table", { class: "simple-table" });
    const thead = el("thead", {}, [el("tr", {}, headers.map((h, i) => el("th", { class: i > 0 ? "num" : "", text: h })))]);
    const tbody = el("tbody", {}, rows.map(r => el("tr", {}, r.map((v, i) => el("td", { class: i > 0 ? "num" : "", text: String(v) })))));
    table.appendChild(thead); table.appendChild(tbody);
    return table;
  }

  // ============================================================ ANOMALIES ====
  function renderAnomalies() {
    const kpiGrid = $("#anomalyKpis");
    kpiGrid.innerHTML = "";
    [
      { label: "Unusual transactions", value: state.asum.count },
      { label: "Total unusual amount", value: money(state.asum.total_amount) },
      { label: "% of all transactions", value: state.asum.pct_of_transactions.toFixed(1) + "%" },
    ].forEach(k => kpiGrid.appendChild(el("div", { class: "kpi-card" }, [el("div", { class: "kpi-label", text: k.label }), el("div", { class: "kpi-value", text: String(k.value) })])));

    const cardsBox = $("#anomalyCards");
    cardsBox.innerHTML = "";
    const unusual = state.anomalyList.filter(o => o.is_unusual);
    if (!unusual.length) {
      cardsBox.appendChild(el("div", { class: "no-anomaly-msg", text: "No unusual transactions were detected in this dataset." }));
    } else {
      unusual.slice(0, 12).forEach(o => {
        cardsBox.appendChild(el("div", { class: "anomaly-card" }, [
          el("div", { class: "anomaly-head", text: `\uD83D\uDEA8 ${o.merchant} \u2014 ${money(o.amount)}` }),
          el("div", { text: `This ${o.category} transaction on ${o.date.toISOString().slice(0, 10)} is significantly higher than your normal spending pattern (z-score: ${o.z_score.toFixed(1)}).` }),
        ]));
      });
    }

    const tbody = $("#anomalyTableBody");
    tbody.innerHTML = "";
    unusual.forEach(o => {
      tbody.appendChild(el("tr", {}, [
        el("td", { text: o.transaction_id }),
        el("td", { text: o.date.toISOString().slice(0, 10) }),
        el("td", { text: o.merchant }),
        el("td", { text: o.category }),
        el("td", { class: "num", text: money(o.amount) }),
        el("td", { class: "num", text: o.z_score.toFixed(2) }),
      ]));
    });

    const recPanel = $("#recurringPanel");
    recPanel.innerHTML = "";
    if (!state.recurring.length) {
      recPanel.appendChild(el("p", { class: "view-note", text: "Not enough monthly history to reliably detect recurring expenses (need at least 2 months of data)." }));
    } else {
      recPanel.appendChild(buildSimpleTable(
        ["Merchant", "Category", "Frequency", "Approx. Amount"],
        state.recurring.map(r => [r.merchant, r.category, r.frequency, money(r.approx_monthly_amount)])
      ));
    }
  }

  // ============================================================ FORECAST ====
  function renderForecast() {
    const box = $("#forecastContent");
    box.innerHTML = "";
    const fc = state.fc;
    if (!fc.available) {
      box.appendChild(el("p", { class: "view-note", text: fc.reason }));
      return;
    }
    const kpis = el("div", { class: "forecast-kpis" }, [
      kpiCard("Moving average estimate", money(fc.moving_average_forecast)),
      kpiCard("Linear trend estimate", money(fc.linear_trend_forecast)),
      kpiCard("Blended estimate", money(fc.blended_forecast)),
    ]);
    box.appendChild(kpis);
    box.appendChild(el("p", { html: `<strong>Trend direction:</strong> ${fc.trend_direction[0].toUpperCase() + fc.trend_direction.slice(1)}` }));
    box.appendChild(el("p", { class: "forecast-quote", html: `Estimated next-month spending: <strong>${money(fc.blended_forecast)}</strong>` }));

    const chartCard = el("div", { class: "chart-card" }, [el("h3", { text: "Historical spending vs forecast" }), el("canvas", { id: "chartForecast" })]);
    box.appendChild(chartCard);
    destroyChart("forecast");
    const labels = fc.history_months.concat(["Next month (forecast)"]);
    const histData = fc.history_values.concat([null]);
    const forecastData = fc.history_values.map(() => null);
    forecastData[forecastData.length - 1] = fc.history_values[fc.history_values.length - 1];
    forecastData.push(fc.blended_forecast);
    state.charts.forecast = new Chart($("#chartForecast"), {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "Historical", data: histData, borderColor: TEAL, backgroundColor: "rgba(15,118,110,0.08)", spanGaps: true },
          { label: "Forecast", data: forecastData, borderColor: CORAL, borderDash: [6, 4], spanGaps: true },
        ],
      },
      options: { plugins: { legend: { position: "bottom", labels: { font: { size: 11 } } } }, scales: { x: { ticks: { font: { size: 10 } } }, y: { ticks: { font: { size: 10 } } } } },
    });
  }

  function kpiCard(label, value) {
    return el("div", { class: "kpi-card" }, [el("div", { class: "kpi-label", text: label }), el("div", { class: "kpi-value", text: value })]);
  }

  // ============================================================ BUDGET ====
  function renderBudget() {
    const recBox = $("#budgetRecommendations");
    recBox.innerHTML = "";
    recBox.appendChild(el("p", { class: "view-note", text: "Recommended budgets are derived from your own historical monthly spending per category \u2014 not arbitrary percentages." }));
    state.recBudgets.slice(0, 6).forEach(r => {
      recBox.appendChild(el("div", { class: "leader-row" }, [
        el("span", { class: "leader-label", html: `<strong>${r.category}</strong>` }),
        el("span", { class: "leader-fill" }),
        el("span", { class: "leader-value", text: `${money(r.recommended_min)}\u2013${money(r.recommended_max)}/mo` }),
      ]));
    });

    const incomeInput = $("#monthlyIncomeInput");
    incomeInput.value = state.monthlyIncome || "";
    incomeInput.oninput = () => { state.monthlyIncome = Number(incomeInput.value) || 0; };

    const catGrid = $("#budgetCategoryInputs");
    catGrid.innerHTML = "";
    const categories = state.catA.map(c => c.category);
    const recMap = {};
    state.recBudgets.forEach(r => { recMap[r.category] = r.avg_monthly_spend; });
    categories.forEach(cat => {
      const field = el("div", { class: "budget-cat-field" });
      field.appendChild(el("label", { text: cat }));
      const defaultVal = state.budgets[cat] !== undefined ? state.budgets[cat] : Math.round((recMap[cat] || 0) / 10) * 10;
      const input = el("input", { type: "number", min: "0", step: "100", value: defaultVal });
      input.addEventListener("input", () => {
        const v = Number(input.value) || 0;
        if (v > 0) state.budgets[cat] = v; else delete state.budgets[cat];
        renderBudgetComparison();
      });
      field.appendChild(input);
      catGrid.appendChild(field);
      if (defaultVal > 0) state.budgets[cat] = defaultVal;
    });

    renderBudgetComparison();
  }

  function renderBudgetComparison() {
    const box = $("#budgetComparison");
    box.innerHTML = "";
    const budgetKeys = Object.keys(state.budgets);
    if (!budgetKeys.length) {
      box.appendChild(el("p", { class: "view-note", text: "Enter category budgets above to see your Budget vs Actual comparison." }));
      state.budgetCmp = [];
      return;
    }
    const months = E.orderedMonths(state.featured);
    const lastMonth = months[months.length - 1];
    const actual = {};
    state.featured.filter(o => o.type === "Expense" && o.month_name === lastMonth).forEach(o => {
      actual[o.category] = (actual[o.category] || 0) + o.amount;
    });
    const cmp = E.compareBudgetToActual(actual, state.budgets);
    state.budgetCmp = cmp;

    box.appendChild(el("h2", { class: "section-subtitle", text: `Budget vs actual \u2014 ${lastMonth}` }));
    cmp.forEach(row => {
      const pct = isNaN(row.pct_used) ? 0 : Math.min(140, row.pct_used);
      const barClass = row.status === "Over Budget" ? "over" : (row.status === "Near Limit" ? "near" : "");
      const label = el("span", { text: row.category });
      label.style.minWidth = "130px";
      const valueSpan = el("span", { text: `${money(row.actual)} of ${money(row.budget)} (${isNaN(row.pct_used) ? "N/A" : Math.round(row.pct_used) + "%"})` });
      valueSpan.style.fontFamily = "var(--font-mono)"; valueSpan.style.fontSize = "12.5px"; valueSpan.style.minWidth = "170px"; valueSpan.style.textAlign = "right";
      box.appendChild(el("div", { class: "budget-status-row" }, [
        el("span", { class: "budget-status-icon", text: E.STATUS_ICON[row.status] || "" }),
        label,
        el("div", { class: "budget-bar-track" }, [el("div", { class: "budget-bar-fill " + barClass, style: `width:${Math.min(100, pct)}%` })]),
        valueSpan,
      ]));
    });

    const chartBox = el("div", { class: "chart-card" }, [el("h3", { text: `Budget vs actual \u2014 ${lastMonth}` }), el("canvas", { id: "chartBudget" })]);
    chartBox.style.marginTop = "20px"; chartBox.style.maxWidth = "640px";
    box.appendChild(chartBox);
    destroyChart("budget");
    state.charts.budget = new Chart($("#chartBudget"), {
      type: "bar",
      data: {
        labels: cmp.map(r => r.category),
        datasets: [
          { label: "Budget", data: cmp.map(r => r.budget), backgroundColor: TEAL, borderRadius: 2 },
          { label: "Actual", data: cmp.map(r => r.actual), backgroundColor: CORAL, borderRadius: 2 },
        ],
      },
      options: { plugins: { legend: { position: "bottom", labels: { font: { size: 11 } } } }, scales: { x: { ticks: { font: { size: 10 } } }, y: { ticks: { font: { size: 10 } } } } },
    });
  }

  // ============================================================ INSIGHTS ====
  function renderInsights() {
    $("#scoreValue").textContent = state.fscore.overall_score;
    const dial = $("#scoreDial");
    const pct = state.fscore.overall_score / 100;
    dial.style.borderColor = pct >= 0.7 ? TEAL : (pct >= 0.4 ? AMBER : CORAL);

    const breakdown = $("#scoreBreakdown");
    breakdown.innerHTML = "";
    Object.keys(state.fscore.breakdown).forEach(name => {
      const d = state.fscore.breakdown[name];
      const item = el("div", { class: "score-item" });
      if (d.score !== null) {
        item.innerHTML = `<strong>${name}:</strong> ${d.score}/100 \u2014 ${d.detail}`;
        const track = el("div", { class: "score-bar-track" }, [el("div", { class: "score-bar-fill", style: `width:${d.score}%` })]);
        item.appendChild(track);
      } else {
        item.innerHTML = `<strong>${name}:</strong> Not applicable \u2014 ${d.detail}`;
      }
      breakdown.appendChild(item);
    });

    const insBox = $("#insightsList");
    insBox.innerHTML = "";
    state.insights.forEach(ins => {
      insBox.appendChild(el("div", { class: "insight-item" }, [el("span", { class: "insight-icon", text: ins.icon }), el("span", { text: ins.text })]));
    });

    const recBox = $("#recommendationsList");
    recBox.innerHTML = "";
    state.recommendations.forEach(rec => {
      recBox.appendChild(el("div", { class: "insight-item" }, [el("span", { class: "insight-icon", text: rec.icon }), el("span", { text: rec.text })]));
    });
  }

  // ============================================================ REPORTS ====
  function renderReportsPreview() {
    const box = $("#reportPreview");
    box.innerHTML = "";
    box.appendChild(el("h4", { text: "Preview \u2014 Executive Summary" }));
    const totalSpend = E.sum(state.catA.map(c => c.total_spent));
    [
      ["Total Spending", money(totalSpend)],
      ["Transactions", state.featured.length.toLocaleString()],
      ["Top Category", state.catA.length ? state.catA[0].category : "N/A"],
      ["Unusual Transactions", state.asum.count],
      ["Financial Health Score", state.fscore.overall_score + "/100"],
    ].forEach(pair => {
      box.appendChild(el("div", { class: "leader-row" }, [
        el("span", { class: "leader-label", text: pair[0] }),
        el("span", { class: "leader-fill" }),
        el("span", { class: "leader-value", text: String(pair[1]) }),
      ]));
    });
  }

  function initReportsButton() {
    $("#generateReportBtn").addEventListener("click", () => {
      const ctx = {
        featured: state.featured, catA: state.catA, ms: state.ms,
        anomalyList: state.anomalyList, asum: state.asum, fc: state.fc,
        budgetCmp: state.budgetCmp || [], recBudgets: state.recBudgets,
        fscore: state.fscore, insights: state.insights, recommendations: state.recommendations,
        totalSpend: E.sum(state.catA.map(c => c.total_spent)),
        avgTxn: E.mean(state.featured.filter(o => o.type === "Expense").map(o => o.amount)) || 0,
      };
      const wb = window.SmartSpendReport.buildExcelReport(ctx);
      XLSX.writeFile(wb, "SmartSpend_Report.xlsx");
    });
  }

  // ============================================================ INIT ====
  document.addEventListener("DOMContentLoaded", () => {
    initLedgerTapePreview();
    initIntake();
    initNav();
    initAnalysisTabs();
    initReportsButton();
  });
})();
