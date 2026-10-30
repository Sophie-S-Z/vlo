import { Pane } from "tweakpane";
import { DEFAULT_LAB, labSettings, setLab } from "./settings";

/**
 * The Ink lab panel (spec 18.1 item 12). Tweakpane loads only here, through import(), so it
 * never reaches the first load.
 */
export function createPanel(container: HTMLElement): () => void {
  const accent =
    getComputedStyle(document.documentElement).getPropertyValue("--vlo-accent").trim() || "#e0664b";
  const state = { ...labSettings(), ink: labSettings().ink || accent };
  const pane = new Pane({ container, title: "Ink lab" });
  const rows = [
    pane.addBinding(state, "particles", { label: "Particles", min: 0.1, max: 1, step: 0.05 }),
    pane.addBinding(state, "ink", { label: "Ink color" }),
    pane.addBinding(state, "grain", { label: "Grain", min: 0, max: 0.15, step: 0.005 }),
    pane.addBinding(state, "bloom", { label: "Bloom", min: 0, max: 3, step: 0.05 }),
  ];
  // Tweakpane shows its labels as plain text; give each control an accessible name.
  for (const row of rows) {
    const label = row.label ?? "";
    row.element
      .querySelectorAll("input")
      .forEach((input) => input.setAttribute("aria-label", label));
    row.element
      .querySelectorAll("button")
      .forEach((button) => button.setAttribute("aria-label", `Pick ${label.toLowerCase()}`));
  }
  pane.addButton({ title: "Reset" }).on("click", () => {
    Object.assign(state, DEFAULT_LAB, { ink: accent });
    pane.refresh();
  });
  // The theme accent stays live until the visitor picks another ink.
  pane.on("change", () => setLab({ ...state, ink: state.ink === accent ? "" : state.ink }));
  return () => pane.dispose();
}
