// Runs before the first paint (spec 18.3 p.00). It marks a first visit to "/" with full motion,
// so CSS can show the entry curtain at once. No JavaScript, a repeat visit, Calm or reduced
// motion: no curtain.
(function () {
  try {
    if (location.pathname !== "/") return;
    if (localStorage.getItem("vlo:entered") === "1") return;
    if (localStorage.getItem("vlo:calm") === "on") return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    document.documentElement.setAttribute("data-entry", "first");
  } catch {
    // Storage blocked: skip the curtain.
  }
})();
