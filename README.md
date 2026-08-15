SmartSpend AI 💰

A standalone, client-side personal finance analysis website that helps users understand their spending, identify anomalies, analyze categories and merchants, forecast expenses, get budget recommendations, and generate downloadable Excel reports.

🚀 Live Demo

Try SmartSpend AI:
https://smart-spend-ai-gules.vercel.app/

✨ Features

- 📊 Expense and spending analysis
- 📁 Upload CSV and Excel (".xlsx") transaction files
- 🧹 Automatic data cleaning and column detection
- 🏷️ Category and merchant analysis
- 📅 Time-based spending analysis
- 🚨 Anomaly detection using IQR + Z-score
- 📈 Expense forecasting using moving average and linear trend
- 💰 Budget recommendations
- ❤️ Financial health score
- 💡 Personalized financial insights and recommendations
- 📑 Downloadable 9-sheet Excel report
- 🎯 Built-in demo transaction dataset
- 📱 Responsive interface for desktop and mobile

🛠️ Technologies Used

- HTML5 — Website structure
- CSS3 — UI and responsive design
- JavaScript — Data processing, analysis, and application logic
- Chart.js — Data visualization
- SheetJS (xlsx) — Excel file reading and report generation
- CSV / Excel — Transaction data input

The application runs entirely in the browser. There is no backend server or database.

📂 Project Structure

SmartSpendWeb/
├── index.html
├── style.css
├── engine.js
├── app.js
├── report.js
├── demo_data.js
├── sample_transactions.csv
└── test/

File Description

- "index.html" — Main website structure
- "style.css" — UI styling and responsive design
- "engine.js" — Core financial analysis engine
- "app.js" — User interface, file upload, navigation, charts, and rendering
- "report.js" — Generates the downloadable Excel report
- "demo_data.js" — Embedded 12-month demo transaction dataset
- "sample_transactions.csv" — Sample transaction data
- "test/" — Testing files for the analysis engine and UI

🧠 How SmartSpend AI Works

The application follows this workflow:

Transaction Data
       ↓
CSV / Excel Upload
       ↓
Data Cleaning
       ↓
Column Detection & Mapping
       ↓
Feature Engineering
       ↓
Financial Analysis
       ↓
 ┌───────────────┬────────────────┬─────────────────┐
 │               │                │                 │
Category      Anomalies       Forecasting      Budget Analysis
Analysis      Detection       & Trends         & Recommendations
 │               │                │                 │
 └───────────────┴────────────────┴─────────────────┘
                       ↓
              Financial Health Score
                       ↓
             Insights & Recommendations
                       ↓
                Excel Report

🔍 Analysis Engine

The main analysis engine is implemented in "engine.js".

It performs:

- CSV parsing
- Excel data processing
- Column detection
- Data cleaning
- Feature engineering
- Category analysis
- Merchant analysis
- Time-based analysis
- Anomaly detection
- Expense forecasting
- Budget recommendations
- Financial health scoring
- Insight generation

The analysis runs completely in the browser.

🚨 Anomaly Detection

The client-side version uses:

- IQR (Interquartile Range)
- Z-score

This approach identifies unusually high or unusual transactions without requiring a backend machine-learning server.

📈 Forecasting

SmartSpend AI uses:

- Moving-average forecasting
- Linear trend analysis

These methods are used to estimate future spending based on historical transaction patterns.

📊 Excel Report

Users can download a comprehensive Excel report generated directly in the browser using SheetJS.

The report contains multiple sheets covering areas such as:

- Transactions
- Category analysis
- Merchant analysis
- Monthly trends
- Anomalies
- Forecasting
- Budget recommendations
- Financial health
- Insights

🔐 Privacy

SmartSpend AI is designed as a client-side application.

Your uploaded transaction data is processed directly inside your browser and is not sent to a backend server.

«Always verify the privacy behavior of third-party libraries and hosting services before using the application with highly sensitive financial information.»

🌐 Deployment

SmartSpend AI is deployed using Vercel.

Live Website

https://smart-spend-ai-gules.vercel.app/

The project can also be hosted on other static hosting platforms such as GitHub Pages or Netlify.

There is no backend or build process required.

💻 Run Locally

Clone the repository:

git clone https://github.com/Sadhiya0201/SmartSpendAI.git

Navigate to the project:

cd SmartSpendAI

You can simply open:

index.html

in your browser.

For a local development server, you can also run:

python3 -m http.server 8000

Then open:

http://localhost:8000

🧪 Testing

The project includes testing files under the "test/" directory.

The analysis engine was tested using Node.js, while the UI was tested using a headless Chromium environment.

The testing covers:

- Data processing
- Financial calculations
- Navigation
- File upload
- Error handling
- UI rendering
- Excel report generation

🔄 Streamlit vs. Web Version

SmartSpend AI was originally designed with a Python/Streamlit approach.

This web version moves the core functionality to JavaScript so that the application can run entirely in the browser without requiring:

- Python
- Streamlit
- A backend server
- A database

The client-side version uses IQR + Z-score anomaly detection instead of Isolation Forest because scikit-learn is not required for the browser-based implementation.

👩‍💻 Author

Sadhiya

GitHub:
https://github.com/Sadhiya0201

⭐ Support

If you find SmartSpend AI useful, consider giving the repository a ⭐ on GitHub!

GitHub Repository:
https://github.com/Sadhiya0201/SmartSpendAI
