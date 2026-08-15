const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("console", msg => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", err => consoleErrors.push("PAGEERROR: " + err.message));

  await page.goto("http://localhost:8791/test-index.html");
  await page.waitForSelector("#demoBtn");
  console.log("PASS: page loaded, demo button present");

  const tapeText = await page.textContent("#ledgerTapeTrack");
  if (!tapeText || tapeText.length < 20) throw new Error("FAIL: ledger tape preview not populated");
  console.log("PASS: ledger tape preview populated");

  await page.click("#demoBtn");
  await page.waitForSelector("#page-app:not(.hidden)", { timeout: 5000 });
  console.log("PASS: demo data loaded, app view shown");

  const badge = await page.textContent("#loadedBadge");
  console.log("Loaded badge:", badge);
  if (!/\d+ transactions loaded/.test(badge)) throw new Error("FAIL: loaded badge text unexpected: " + badge);
  console.log("PASS: loaded badge shows transaction count");

  const kpiCards = await page.$$eval("#kpiGrid .kpi-card", els => els.map(e => ({
    label: e.querySelector(".kpi-label").textContent,
    value: e.querySelector(".kpi-value").textContent,
  })));
  console.log("KPI cards:", JSON.stringify(kpiCards, null, 2));
  if (kpiCards.length < 6) throw new Error("FAIL: expected at least 6 KPI cards, got " + kpiCards.length);
  const totalSpendCard = kpiCards.find(k => k.label === "Total spending");
  if (!totalSpendCard || !/\u20B9[\d,]+/.test(totalSpendCard.value)) throw new Error("FAIL: total spending KPI malformed: " + JSON.stringify(totalSpendCard));
  console.log("PASS: KPI grid populated with plausible values");

  const chartCalls = await page.evaluate(() => window.__chartCalls.length);
  console.log("Chart() constructor calls on dashboard:", chartCalls);
  if (chartCalls < 7) throw new Error("FAIL: expected at least 7 chart instantiations on dashboard, got " + chartCalls);
  console.log("PASS: expected number of charts instantiated");

  const pages = ["transactions", "analysis", "anomalies", "forecast", "budget", "insights", "reports"];
  for (const p of pages) {
    await page.click(`.nav-item[data-page="${p}"]`);
    await page.waitForTimeout(150);
    const visible = await page.isVisible(`#view-${p}`);
    if (!visible) throw new Error(`FAIL: view-${p} did not become visible`);
    console.log(`PASS: navigated to ${p}`);
  }

  await page.click('.nav-item[data-page="transactions"]');
  await page.waitForTimeout(150);
  const rowCount = await page.$$eval("#txnTableBody tr", trs => trs.length);
  console.log("Transaction rows rendered:", rowCount);
  if (rowCount < 5) throw new Error("FAIL: expected transaction rows in table");
  const filterCountText = await page.textContent("#filterCount");
  console.log("Filter count text:", filterCountText);

  const catOptions = await page.$$eval("#filterCategory option", opts => opts.map(o => o.value));
  console.log("Category filter options:", catOptions);
  if (catOptions.length < 3) throw new Error("FAIL: expected multiple category filter options");
  await page.selectOption("#filterCategory", [catOptions[0]]);
  await page.waitForTimeout(150);
  const filteredCountText = await page.textContent("#filterCount");
  console.log("After filtering by", catOptions[0], "->", filteredCountText);

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 5000 }),
    page.click("#downloadCsvBtn"),
  ]);
  console.log("PASS: CSV download triggered, suggested filename:", download.suggestedFilename());

  await page.click("#resetFiltersBtn");
  await page.waitForTimeout(150);
  console.log("PASS: filters reset without error");

  await page.click('.nav-item[data-page="analysis"]');
  await page.waitForTimeout(150);
  for (const tab of ["category", "merchant", "time", "trend"]) {
    await page.click(`.tab-btn[data-tab="${tab}"]`);
    await page.waitForTimeout(100);
    const visible = await page.isVisible(`#tab-${tab}`);
    if (!visible) throw new Error(`FAIL: analysis tab ${tab} not visible after click`);
  }
  console.log("PASS: all analysis tabs clickable and render");

  await page.click('.nav-item[data-page="anomalies"]');
  await page.waitForTimeout(150);
  const anomalyKpis = await page.$$eval("#anomalyKpis .kpi-value", els => els.map(e => e.textContent));
  console.log("Anomaly KPIs:", anomalyKpis);
  const anomalyRows = await page.$$eval("#anomalyTableBody tr", trs => trs.length);
  console.log("Anomaly table rows:", anomalyRows);

  await page.click('.nav-item[data-page="forecast"]');
  await page.waitForTimeout(150);
  const forecastQuote = await page.textContent("#forecastContent");
  console.log("Forecast content present:", forecastQuote && forecastQuote.length > 30);
  if (!forecastQuote || forecastQuote.length < 30) throw new Error("FAIL: forecast content missing");
  console.log("PASS: forecast content rendered");

  await page.click('.nav-item[data-page="budget"]');
  await page.waitForTimeout(150);
  await page.fill("#monthlyIncomeInput", "50000");
  const budgetInputs = await page.$$("#budgetCategoryInputs input");
  console.log("Budget category inputs found:", budgetInputs.length);
  if (budgetInputs.length < 3) throw new Error("FAIL: expected budget category inputs");
  await budgetInputs[0].fill("5000");
  await page.waitForTimeout(150);
  const budgetRows = await page.$$eval(".budget-status-row", els => els.length);
  console.log("Budget comparison rows after entering a budget:", budgetRows);
  if (budgetRows < 1) throw new Error("FAIL: expected budget comparison rows to render");
  console.log("PASS: budget comparison renders on input");

  await page.click('.nav-item[data-page="insights"]');
  await page.waitForTimeout(150);
  const scoreValue = await page.textContent("#scoreValue");
  console.log("Financial health score:", scoreValue);
  if (!/^\d+$/.test(scoreValue.trim())) throw new Error("FAIL: score value not numeric: " + scoreValue);
  const insightCount = await page.$$eval("#insightsList .insight-item", els => els.length);
  const recCount = await page.$$eval("#recommendationsList .insight-item", els => els.length);
  console.log("Insights:", insightCount, "Recommendations:", recCount);
  if (insightCount < 3 || recCount < 1) throw new Error("FAIL: expected insights and recommendations to render");
  console.log("PASS: insights & recommendations rendered");

  await page.click('.nav-item[data-page="reports"]');
  await page.waitForTimeout(150);
  await page.click("#generateReportBtn");
  await page.waitForTimeout(150);
  const writeFileCalls = await page.evaluate(() => window.__xlsxWriteFileCalls);
  console.log("XLSX.writeFile calls:", JSON.stringify(writeFileCalls));
  if (!writeFileCalls.length) throw new Error("FAIL: expected XLSX.writeFile to be called");
  if (writeFileCalls[0].sheetNames.length !== 9) throw new Error("FAIL: expected 9 sheets in report, got " + writeFileCalls[0].sheetNames.length);
  console.log("PASS: Excel report generation produced 9 sheets:", writeFileCalls[0].sheetNames);

  await page.click("#loadDifferentBtn");
  await page.waitForTimeout(150);
  const homeVisible = await page.isVisible("#page-home");
  if (!homeVisible) throw new Error("FAIL: home page not visible after reset");
  console.log("PASS: 'load different file' resets to home page");

  const badCsv = "Date,Description\n2026-01-01,Coffee\n2026-01-02,Lunch\n";
  await page.setInputFiles("#fileInput", { name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from(badCsv) });
  await page.waitForTimeout(200);
  const mappingVisible = await page.isVisible("#mappingPanel");
  console.log("Mapping panel visible for file missing amount column:", mappingVisible);
  if (!mappingVisible) throw new Error("FAIL: mapping panel should appear for a file missing the amount column");
  console.log("PASS: missing-column CSV correctly triggers mapping panel");

  // still on the home page (mapping panel shown, not yet confirmed) — reload to reset cleanly
  await page.reload();
  await page.waitForSelector("#demoBtn");
  await page.waitForTimeout(100);
  const emptyCsv = "";
  await page.setInputFiles("#fileInput", { name: "empty.csv", mimeType: "text/csv", buffer: Buffer.from(emptyCsv) });
  await page.waitForTimeout(200);
  const errorVisible = await page.isVisible("#fileError");
  const errorText = await page.textContent("#fileError");
  console.log("Error shown for empty file:", errorVisible, errorText);
  if (!errorVisible) throw new Error("FAIL: empty file should show an error message");
  console.log("PASS: empty CSV correctly shows error");

  // Filter out 403s from the Google Fonts CDN — that's this sandbox's network
  // allowlist blocking an external font request, not an application bug.
  const realErrors = consoleErrors.filter(e => !/403/.test(e));
  console.log("\nConsole errors captured during entire run:", consoleErrors.length,
              "(non-network-sandbox errors:", realErrors.length + ")");
  if (realErrors.length) {
    console.log(JSON.stringify(realErrors, null, 2));
    throw new Error("FAIL: unexpected console errors were captured during the test run");
  }
  console.log("PASS: zero unexpected console errors during full run");

  await browser.close();
  console.log("\nALL BROWSER TESTS PASSED");
})().catch(e => {
  console.error("\nTEST SUITE FAILED:", e.message);
  process.exit(1);
});
