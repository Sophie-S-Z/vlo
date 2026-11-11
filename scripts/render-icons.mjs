// Renders the app icons to PNG with Playwright, so no image package is needed.
// Run: npm run icons
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const root = process.cwd();
const font = readFileSync(
  join(root, 'node_modules/@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2'),
).toString('base64');

const INK = '#0b0e14';
const PAPER_TEXT = '#ebe9e5';
const ACCENT = '#a9d4b3';

// scale: share of the canvas that the mark fills. Maskable icons keep the mark inside the 80% safe zone.
function html(size, scale, radius) {
  const glyph = Math.round(size * 0.62 * scale);
  return `<!doctype html><html><head><style>
    @font-face { font-family: F; src: url(data:font/woff2;base64,${font}) format('woff2'); font-weight: 100 900; }
    html, body { margin: 0; width: ${size}px; height: ${size}px; background: transparent; }
    .tile { width: ${size}px; height: ${size}px; background: ${INK}; border-radius: ${radius}px;
      display: grid; place-items: center; position: relative; overflow: hidden; }
    .v { font-family: F; font-size: ${glyph}px; line-height: 1; color: ${PAPER_TEXT};
      font-variation-settings: 'SOFT' 100, 'opsz' 144, 'wght' 560; transform: translateY(-4%); }
    .dot { position: absolute; width: ${Math.round(glyph * 0.13)}px; height: ${Math.round(glyph * 0.13)}px;
      border-radius: 50%; background: ${ACCENT}; left: 50%; top: 50%;
      transform: translate(${Math.round(glyph * 0.36)}px, ${Math.round(glyph * 0.26)}px); }
  </style></head><body><div class="tile"><span class="v">V</span><span class="dot"></span></div></body></html>`;
}

const targets = [
  { file: 'icon-192.png', size: 192, scale: 1, radius: 0 },
  { file: 'icon-512.png', size: 512, scale: 1, radius: 0 },
  { file: 'maskable-512.png', size: 512, scale: 0.78, radius: 0 },
  { file: 'apple-touch-icon.png', size: 180, scale: 1, radius: 0 },
  { file: 'favicon-48.png', size: 48, scale: 1.1, radius: 10 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(html(t.size, t.scale, t.radius));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(root, 'public/icons', t.file), omitBackground: true });
  console.log(`Wrote public/icons/${t.file}`);
}
await browser.close();
