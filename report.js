/*
  report.js — builds a 9-sheet Excel workbook from the analysis context,
  entirely client-side using SheetJS (window.XLSX). Depends on engine.js
  having already run (for the computed context object).
*/
(function () {
  "use strict";

  function sheetFromAoA(aoa) {
    return XLSX.utils.aoa_to_sheet(aoa);
  }

  function fmtDate(d) {
    return d.toISOString().slice(0, 10);
  }

  function buildExecutiveSummarySheet(ctx) {
    const rows = [];
    rows.push(["SmartSpend AI — Executive Summary"]);
    rows.push(["Generated from uploaded transaction data"]);
    rows.push([]);
    rows.push(["Total Spending", Math.round(ctx.totalSpend)]);
    rows.push(["Number of Transactions", ctx.featured.length]);
    rows.push(["Average Transaction", Math.round(ctx.avgTxn)]);
    rows.push(["Top Spending Category", ctx.catA.length ? ctx.catA[0].category : "N/A"]);
    rows.push(["Unusual Transactions", ctx.asum.count]);
    rows.push(["Financial Health Score", ctx.fscore.overall_score + " / 100"]);
    rows.push([]);
    rows.push(["Key Insights"]);
    ctx.insights.forEach(ins => rows.push([ins.icon + " " + ins.text]));
    return sheetFromAoA(rows);
  }

  function buildCleanedTransactionsSheet(ctx) {
    const header = ["Transaction ID", "Date", "Merchant", "Category", "Amount", "Payment Method", "Type"];
    const rows = [header];
    ctx.featured.forEach(o => {
      rows.push([o.transaction_id, fmtDate(o.date), o.merchant, o.category, o.amount, o.payment_method, o.type]);
    });
    return sheetFromAoA(rows);
  }

  function buildSpendingAnalysisSheet(ctx) {
    const rows = [["Spending Analysis"], []];
    rows.push(["Month", "Total Spent"]);
    ctx.ms.forEach(m => rows.push([m.month_name, Math.round(m.total_spent)]));
    return sheetFromAoA(rows);
  }

  function buildCategoryAnalysisSheet(ctx) {
    const rows = [["Category Analysis"], []];
    rows.push(["Category", "Total Spent", "Transactions", "Avg Transaction", "% of Total"]);
    ctx.catA.forEach(c => rows.push([c.category, Math.round(c.total_spent), c.transactions, Math.round(c.avg_transaction), Number(c.pct_of_total.toFixed(1))]));
    return sheetFromAoA(rows);
  }

  function buildAnomaliesSheet(ctx) {
    const rows = [["Unusual Spending (Anomaly Detection)"], ["IQR / Z-score based — not a fraud determination"], []];
    const unusual = ctx.anomalyList.filter(o => o.is_unusual);
    if (unusual.length) {
      rows.push(["Transaction ID", "Date", "Merchant", "Category", "Amount", "Z-Score", "Reason"]);
      unusual.forEach(o => rows.push([o.transaction_id, fmtDate(o.date), o.merchant, o.category, o.amount, Number(o.z_score.toFixed(2)), o.anomaly_reason]));
    } else {
      rows.push(["No unusual transactions were detected in this dataset."]);
    }
    return sheetFromAoA(rows);
  }

  function buildForecastSheet(ctx) {
    const rows = [["Spending Forecast"], ["Estimates based on moving average + linear trend — not guaranteed"], []];
    const fc = ctx.fc;
    if (fc.available) {
      rows.push(["Moving Average Forecast (next month)", Math.round(fc.moving_average_forecast)]);
      rows.push(["Linear Trend Forecast (next month)", Math.round(fc.linear_trend_forecast)]);
      rows.push(["Blended Estimate (next month)", Math.round(fc.blended_forecast)]);
      rows.push(["Trend Direction", fc.trend_direction]);
      rows.push([]);
      rows.push(["Month", "Historical Spending"]);
      fc.history_months.forEach((m, i) => rows.push([m, Math.round(fc.history_values[i])]));
    } else {
      rows.push([fc.reason]);
    }
    return sheetFromAoA(rows);
  }

  function buildBudgetSheet(ctx) {
    const rows = [["Budget Analysis"], []];
    if (ctx.budgetCmp && ctx.budgetCmp.length) {
      rows.push(["Category", "Budget", "Actual", "% Used", "Status"]);
      ctx.budgetCmp.forEach(b => rows.push([b.category, Math.round(b.budget), Math.round(b.actual), isNaN(b.pct_used) ? "" : Number(b.pct_used.toFixed(1)), b.status]));
    } else {
      rows.push(["No budget was entered for this session. Set a monthly budget in the app to populate this sheet."]);
    }
    rows.push([]);
    rows.push(["Data-Driven Recommended Budgets"]);
    rows.push(["Category", "Avg Monthly Spend", "Recommended Min", "Recommended Max"]);
    ctx.recBudgets.forEach(r => rows.push([r.category, Math.round(r.avg_monthly_spend), Math.round(r.recommended_min), Math.round(r.recommended_max)]));
    return sheetFromAoA(rows);
  }

  function buildSmartInsightsSheet(ctx) {
    const rows = [["Smart Insights & Recommendations"], [], ["Insights"]];
    ctx.insights.forEach(i => rows.push([i.icon + " " + i.text]));
    rows.push([]);
    rows.push(["Recommendations"]);
    ctx.recommendations.forEach(r => rows.push([r.icon + " " + r.text]));
    return sheetFromAoA(rows);
  }

  function buildDataDictionarySheet() {
    const rows = [["Data Dictionary"], []];
    rows.push(["Column", "Type", "Description"]);
    rows.push(["transaction_id", "Text", "Unique identifier for the transaction"]);
    rows.push(["date", "Date", "Transaction date"]);
    rows.push(["merchant", "Text", "Merchant / payee name"]);
    rows.push(["category", "Text", "Spending category (standardized during cleaning)"]);
    rows.push(["amount", "Number", "Transaction amount (absolute value)"]);
    rows.push(["payment_method", "Text", "Payment method used"]);
    rows.push(["type", "Text", "Income or Expense"]);
    return sheetFromAoA(rows);
  }

  function buildExcelReport(ctx) {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, buildExecutiveSummarySheet(ctx), "Executive_Summary");
    XLSX.utils.book_append_sheet(wb, buildCleanedTransactionsSheet(ctx), "Cleaned_Transactions");
    XLSX.utils.book_append_sheet(wb, buildSpendingAnalysisSheet(ctx), "Spending_Analysis");
    XLSX.utils.book_append_sheet(wb, buildCategoryAnalysisSheet(ctx), "Category_Analysis");
    XLSX.utils.book_append_sheet(wb, buildAnomaliesSheet(ctx), "Anomalies");
    XLSX.utils.book_append_sheet(wb, buildForecastSheet(ctx), "Forecast");
    XLSX.utils.book_append_sheet(wb, buildBudgetSheet(ctx), "Budget_Analysis");
    XLSX.utils.book_append_sheet(wb, buildSmartInsightsSheet(ctx), "Smart_Insights");
    XLSX.utils.book_append_sheet(wb, buildDataDictionarySheet(), "Data_Dictionary");
    return wb;
  }

  window.SmartSpendReport = { buildExcelReport };
})();
