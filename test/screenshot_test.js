const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();

  // Desktop
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await page.goto("http://localhost:8791/test-index.html");
  await page.waitForSelector("#demoBtn");
  await page.screenshot({ path: "/home/claude/SmartSpendWeb/test/shot_home.png" });

  await page.click("#demoBtn");
  await page.waitForSelector("#page-app:not(.hidden)");
  await page.waitForTimeout(300);
  await page.screenshot({ path: "/home/claude/SmartSpendWeb/test/shot_dashboard.png", fullPage: true });

  await page.click('.nav-item[data-page="transactions"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: "/home/claude/SmartSpendWeb/test/shot_transactions.png", fullPage: true });

  await page.click('.nav-item[data-page="insights"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: "/home/claude/SmartSpendWeb/test/shot_insights.png", fullPage: true });

  await page.click('.nav-item[data-page="budget"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: "/home/claude/SmartSpendWeb/test/shot_budget.png", fullPage: true });

  await page.close();

  // Mobile
  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobilePage.goto("http://localhost:8791/test-index.html");
  await mobilePage.waitForSelector("#demoBtn");
  await mobilePage.screenshot({ path: "/home/claude/SmartSpendWeb/test/shot_mobile_home.png", fullPage: true });
  await mobilePage.click("#demoBtn");
  await mobilePage.waitForSelector("#page-app:not(.hidden)");
  await mobilePage.waitForTimeout(300);
  await mobilePage.screenshot({ path: "/home/claude/SmartSpendWeb/test/shot_mobile_dashboard.png", fullPage: true });

  await browser.close();
  console.log("Screenshots saved");
})();
