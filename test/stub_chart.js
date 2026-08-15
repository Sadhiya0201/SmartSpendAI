// Minimal stand-in for Chart.js so app.js's `new Chart(...)` calls don't
// throw when the real CDN script isn't reachable in this test environment.
// Records what it was called with, for test assertions.
window.__chartCalls = [];
window.Chart = function (ctx, config) {
  window.__chartCalls.push({ ctxId: ctx && ctx.id, config });
  this.destroy = function () {};
  this.data = config.data;
};
