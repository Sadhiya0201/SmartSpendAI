// Minimal stand-in for SheetJS (XLSX) so report.js and the .xlsx upload path
// can be exercised without the real CDN library. Implements just enough of
// the API surface used by app.js / report.js.
window.__xlsxWriteFileCalls = [];
window.XLSX = {
  utils: {
    book_new: function () { return { SheetNames: [], Sheets: {} }; },
    book_append_sheet: function (wb, sheet, name) { wb.SheetNames.push(name); wb.Sheets[name] = sheet; },
    aoa_to_sheet: function (aoa) { return { __aoa: aoa }; },
    sheet_to_json: function (sheet, opts) { return sheet.__rows || []; },
  },
  read: function (data, opts) {
    // Not exercised in the CSV-only automated test path; xlsx upload is
    // covered manually / documented as a known gap in sandbox testing.
    return { SheetNames: ["Sheet1"], Sheets: { Sheet1: { __rows: [] } } };
  },
  writeFile: function (wb, filename) {
    window.__xlsxWriteFileCalls.push({ filename: filename, sheetNames: wb.SheetNames.slice() });
  },
};
