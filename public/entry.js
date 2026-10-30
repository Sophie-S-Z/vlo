// Runs before the first paint (spec 18.3 p.00, ADR 0011). It writes the motion mode, so CSS
// never flashes the wrong one, and it marks a first visit to "/" for the entry curtain.
// No JavaScript, a repeat visit or Calm: no curtain.
(function () {
  const root = document.documentElement;
  let calm = false;
  try {
    calm = localStorage.getItem("vlo:calm") === "on";
  } catch {
    // Storage blocked: Calm is off.
  }
  const gentle = !calm && matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.setAttribute("data-motion", calm ? "reduced" : gentle ? "gentle" : "full");
  try {
    if (calm || location.pathname !== "/") return;
    if (localStorage.getItem("vlo:entered") === "1") return;
    root.setAttribute("data-entry", "first");
  } catch {
    // Storage blocked: skip the curtain.
  }
})();
