# SmartSpend AI — Website

A standalone, client-side website version of SmartSpend AI. No server, no
backend, no build step — open `index.html` in a browser (or host the folder
anywhere static files are served) and it works.

## Run it

**Simplest:** double-click `index.html`, or drag it into a browser tab.

**Recommended (avoids browser file:// quirks):** serve the folder locally:

```bash
cd SmartSpendWeb
python3 -m http.server 8000
# then open http://localhost:8000
```

Or deploy the folder as-is to GitHub Pages, Netlify, Vercel, or any static
host — there's nothing to build or configure.

## How it works

- **`engine.js`** — the entire analysis engine (CSV parsing, column detection,
  cleaning, feature engineering, category/merchant/time analysis, anomaly
  detection via IQR + Z-score, forecasting via moving-average + linear trend,
  budget recommendations, the financial health score, and insight/
  recommendation generation). Pure JS with no DOM access, so it's portable
  and was unit-tested directly under Node.
- **`app.js`** — the UI layer: file upload/drag-drop, column-mapping panel,
  navigation, and every page's rendering + Chart.js wiring. Talks to
  `engine.js` for all calculations.
- **`report.js`** — builds the downloadable 9-sheet Excel report client-side
  using SheetJS.
- **`demo_data.js`** — the realistic 12-month demo dataset, embedded directly
  as a JS string (not fetched), so the "Try demo ledger" button works even
  when the page is opened via `file://` with no server at all.
- **`index.html` / `style.css`** — structure and the "ledger" visual design
  (paper background, deep teal ink, coral/amber accents, monospace figures).

Two external libraries are loaded from CDN for functionality the browser
doesn't provide natively: **Chart.js** (all charts) and **SheetJS/xlsx**
(reading uploaded .xlsx files and writing the Excel report). Everything else
— all analysis, all cleaning, all calculations — runs entirely in your
browser tab. Nothing you upload is sent anywhere.

## What's different from the Streamlit version

- No Isolation Forest model for anomaly detection (that needs scikit-learn,
  which isn't practical to run client-side) — this version uses IQR +
  Z-score only. On the demo dataset this flags slightly fewer transactions
  (20 vs. 33) than the Python version; both are legitimate, just different
  sensitivity.
- Everything else (cleaning logic, feature engineering, category/merchant/
  time analysis, forecasting, budget recommendations, the financial health
  score formula, and insight generation) is a direct port and was verified
  to produce matching numbers against the Python engine on the same demo
  dataset.

## Testing notes

This was built and tested in a sandboxed environment with no general
internet access, so the CDN-hosted Chart.js/SheetJS scripts couldn't be
fetched directly here. To still get real coverage:

- `engine.js` was unit-tested directly under Node.js against the demo CSV
  (see `test/` for the harness) — every calculation was verified.
- The full UI was tested end-to-end in a **real headless Chromium browser**
  (via Playwright) with Chart.js/SheetJS swapped for minimal stand-ins that
  preserve the same call signatures — this exercised the actual DOM
  rendering, navigation, filtering, file upload/error handling, and Excel
  report generation, just not the literal pixel output of Chart.js charts.
- Fixed one real bug found this way: on narrow mobile viewports, the nav bar
  could collapse to zero width due to a flexbox/overflow interaction.

You should still do a final check with real Chart.js/SheetJS loaded (i.e.
open the actual `index.html`, not the test harness) before treating this as
fully verified — the sandbox this was built in can't fetch those CDN scripts
to confirm the real chart rendering pixel-for-pixel.

## Files

```
SmartSpendWeb/
├── index.html              — page structure
├── style.css                — "ledger" design system
├── engine.js                 — analysis engine (pure JS, unit-tested)
├── app.js                    — UI wiring + Chart.js rendering
├── report.js                  — client-side Excel report builder (SheetJS)
├── demo_data.js                — embedded 12-month demo dataset
├── sample_transactions.csv       — the same demo data as a plain CSV (for reference)
└── test/                          — Node + Playwright test harness (not needed to run the site)
```
