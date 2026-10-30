import { wrapLine, type Mask } from "./shapes";

/** Glyphs in the atlas (spec 18.2): a to z, punctuation and accented letters. */
export const GLYPHS = "abcdefghijklmnopqrstuvwxyzéèàçêüöñ.,;:!?—'«»&";
export const ATLAS_COLUMNS = 8;
const CELL = 64;

/** White glyphs on a transparent grid; the shader tints them. */
export function drawGlyphAtlas(font: string): HTMLCanvasElement {
  const rows = Math.ceil(GLYPHS.length / ATLAS_COLUMNS);
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_COLUMNS * CELL;
  canvas.height = rows * CELL;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#fff";
  context.font = `48px ${font}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  [...GLYPHS].forEach((glyph, i) => {
    const x = (i % ATLAS_COLUMNS) * CELL + CELL / 2;
    const y = Math.floor(i / ATLAS_COLUMNS) * CELL + CELL / 2;
    context.fillText(glyph, x, y);
  });
  return canvas;
}

/** The "Vlo" wordmark as an alpha bitmap for the shape sampler. */
export function drawWordmarkMask(font: string): Mask {
  const width = 360;
  const height = 140;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.fillStyle = "#fff";
  context.font = `120px ${font}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("Vlo", width / 2, height / 2 + 6);
  const data = context.getImageData(0, 0, width, height).data;
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]!;
  return { width, height, alpha };
}

/** Characters per line before the visitor's first line wraps. */
const LINE_WIDTH = 22;

/**
 * The visitor's first line as an alpha bitmap (ADR 0012), in the wordmark's frame: up to three
 * lines, sized to fill the same box.
 */
export function drawLineMask(text: string, font: string): Mask {
  const width = 360;
  const height = 140;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  const lines = wrapLine(text, LINE_WIDTH);
  let size = Math.floor(height / Math.max(1, lines.length) / 1.15);
  // Fraunces changes its width with the optical size, so the fit takes a few rounds.
  for (let round = 0; round < 4; round++) {
    context.font = `${size}px ${font}`;
    const widest = Math.max(1, ...lines.map((line) => context.measureText(line).width));
    if (widest <= width * 0.96) break;
    size = Math.max(10, Math.floor(size * ((width * 0.96) / widest)));
  }
  context.font = `${size}px ${font}`;
  context.fillStyle = "#fff";
  context.textAlign = "center";
  context.textBaseline = "middle";
  const step = size * 1.1;
  lines.forEach((line, i) => {
    context.fillText(line, width / 2, height / 2 + (i - (lines.length - 1) / 2) * step);
  });
  const data = context.getImageData(0, 0, width, height).data;
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]!;
  return { width, height, alpha };
}
