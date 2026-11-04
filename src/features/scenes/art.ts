import type { SceneId } from './scenes';

/*
 * The artwork for each scene, drawn with the canvas 2D API. The same code runs in the scene worker with an
 * OffscreenCanvas and on the main thread with a canvas element. Each scene paints its still parts once per
 * size into a cache, and each frame copies the cache and draws the moving parts.
 */

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Surface = HTMLCanvasElement | OffscreenCanvas;

export interface SceneArt {
  /** Paints the still parts for a canvas of this size in device pixels. */
  resize: (width: number, height: number) => void;
  /** Draws the scene at `t` seconds. */
  draw: (t: number) => void;
}

/** A small seeded random number source, so a scene looks the same on each visit. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function surface(width: number, height: number): Surface {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context(target: Surface): Ctx {
  const ctx = target.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas context');
  return ctx;
}

function vertical(ctx: Ctx, height: number, stops: readonly [number, string][]): CanvasGradient {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  for (const [at, color] of stops) gradient.addColorStop(at, color);
  return gradient;
}

function glow(ctx: Ctx, x: number, y: number, r: number, inner: string, outer = 'rgb(0 0 0 / 0)'): void {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** A hill line across the canvas from summed sine waves. */
function hills(
  ctx: Ctx,
  width: number,
  height: number,
  base: number,
  amp: number,
  color: string,
  phase: number,
): void {
  ctx.beginPath();
  ctx.moveTo(0, height);
  for (let x = 0; x <= width; x += Math.max(4, width / 120)) {
    const y =
      base +
      Math.sin(x / (width * 0.18) + phase) * amp +
      Math.sin(x / (width * 0.07) + phase * 2.3) * amp * 0.35;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function pine(ctx: Ctx, x: number, ground: number, h: number, color: string): void {
  const w = h * 0.42;
  ctx.fillStyle = color;
  for (let tier = 0; tier < 4; tier++) {
    const top = ground - h + tier * h * 0.2;
    const spread = w * (0.45 + tier * 0.18);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x - spread, top + h * 0.34);
    ctx.lineTo(x + spread, top + h * 0.34);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillRect(x - h * 0.03, ground - h * 0.12, h * 0.06, h * 0.12);
}

/** Shared frame plumbing: a cache for the still parts, and the size. */
function base(ctx: Ctx, paintStill: (still: Ctx, w: number, h: number) => void) {
  let cache: Surface | null = null;
  const size = { w: 1, h: 1 };
  return {
    size,
    resize: (width: number, height: number) => {
      size.w = Math.max(1, Math.round(width));
      size.h = Math.max(1, Math.round(height));
      cache = surface(size.w, size.h);
      paintStill(context(cache), size.w, size.h);
    },
    still: () => {
      if (cache) ctx.drawImage(cache, 0, 0);
    },
  };
}

function rain(ctx: Ctx): SceneArt {
  const rand = seeded(11);
  const scene = base(ctx, (s, w, h) => {
    s.fillStyle = vertical(s, h, [
      [0, '#1b2333'],
      [0.55, '#2c3a4f'],
      [1, '#3b4a5e'],
    ]);
    s.fillRect(0, 0, w, h);
    const lights = seeded(5);
    const colors = ['255 190 110', '255 214 150', '120 200 210', '240 140 120', '200 210 255'];
    for (let i = 0; i < 46; i++) {
      const x = lights() * w;
      const y = h * (0.35 + lights() * 0.6);
      const r = (10 + lights() * 38) * (h / 900);
      const color = colors[Math.floor(lights() * colors.length)] ?? colors[0];
      glow(s, x, y, r, `rgb(${color ?? ''} / ${String(0.1 + lights() * 0.22)})`);
    }
    // The window frame: a cross of dark bars.
    s.fillStyle = 'rgb(10 13 20 / 0.85)';
    const bar = Math.max(6, w * 0.012);
    s.fillRect(w * 0.5 - bar / 2, 0, bar, h);
    s.fillRect(0, h * 0.42 - bar / 2, w, bar);
  });
  const drops = Array.from({ length: 150 }, () => ({
    x: rand(),
    y: rand(),
    len: 0.5 + rand(),
    v: 0.8 + rand() * 0.6,
  }));
  const beads = Array.from({ length: 34 }, () => ({
    x: rand(),
    y: rand(),
    r: 0.6 + rand(),
    v: 0.004 + rand() * 0.02,
  }));
  return {
    resize: scene.resize,
    draw(t) {
      const { w, h } = scene.size;
      const k = h / 900;
      scene.still();
      ctx.strokeStyle = 'rgb(201 214 232 / 0.28)';
      ctx.lineWidth = Math.max(1, k);
      ctx.beginPath();
      for (const d of drops) {
        const y = ((d.y + t * 0.9 * d.v) % 1.1) * h - 0.05 * h;
        const x = (d.x * w + y * 0.08) % w;
        ctx.moveTo(x, y);
        ctx.lineTo(x + 3 * k, y + 26 * d.len * k);
      }
      ctx.stroke();
      for (const b of beads) {
        const y = ((b.y + t * b.v) % 1) * h;
        const r = (2 + b.r * 3) * k;
        ctx.fillStyle = 'rgb(220 230 245 / 0.35)';
        ctx.beginPath();
        ctx.ellipse(b.x * w, y, r * 0.8, r, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgb(255 255 255 / 0.5)';
        ctx.fillRect(b.x * w - r * 0.3, y - r * 0.5, Math.max(1, r * 0.3), Math.max(1, r * 0.3));
      }
    },
  };
}

function fireplace(ctx: Ctx): SceneArt {
  const rand = seeded(23);
  /** The top of the hearth. The fire burns along the whole width, so it shows on both sides of the page. */
  const hearth = 0.7;
  const scene = base(ctx, (s, w, h) => {
    s.fillStyle = vertical(s, h, [
      [0, '#1a1210'],
      [1, '#2a1a14'],
    ]);
    s.fillRect(0, 0, w, h);
    // Bricks above the hearth.
    const bw = Math.max(24, h / 16);
    const bh = bw * 0.38;
    s.fillStyle = 'rgb(90 45 30 / 0.22)';
    for (let row = 0; row * bh < h * (hearth - 0.08); row++) {
      const y = h * 0.04 + row * bh;
      for (let x = (row % 2) * -bw * 0.5; x < w; x += bw) s.fillRect(x + 2, y + 2, bw - 4, bh - 4);
    }
    // The mantel and the dark hearth below it.
    s.fillStyle = '#3a241a';
    s.fillRect(0, h * (hearth - 0.05), w, h * 0.03);
    s.fillStyle = '#0d0807';
    s.fillRect(0, h * hearth, w, h * (1 - hearth));
    // Logs along the hearth floor.
    s.fillStyle = '#2b1a12';
    const lw = h * 0.22;
    for (let x = -lw * 0.3; x < w; x += lw * 0.9) {
      s.beginPath();
      s.ellipse(x + lw / 2, h * 0.965, lw / 2, h * 0.02, -0.05, 0, Math.PI * 2);
      s.fill();
    }
  });
  const embers = Array.from({ length: 70 }, () => ({
    x: rand(),
    p: rand(),
    v: 0.05 + rand() * 0.08,
    s: rand(),
  }));
  const tongues = Array.from({ length: 40 }, () => ({
    at: rand(),
    phase: rand() * 6,
    size: 0.6 + rand() * 0.5,
  }));
  return {
    resize: scene.resize,
    draw(t) {
      const { w, h } = scene.size;
      scene.still();
      const floor = h * 0.95;
      const flicker = 0.85 + Math.sin(t * 7.3) * 0.06 + Math.sin(t * 13.1) * 0.04;
      ctx.globalCompositeOperation = 'lighter';
      const warm = ctx.createLinearGradient(0, h, 0, h * 0.45);
      warm.addColorStop(0, `rgb(255 140 60 / ${String(0.4 * flicker)})`);
      warm.addColorStop(1, 'rgb(255 140 60 / 0)');
      ctx.fillStyle = warm;
      ctx.fillRect(0, h * 0.45, w, h * 0.55);
      // About one flame for every tenth of the height across the width.
      const count = Math.min(tongues.length, Math.ceil(w / (h * 0.1)));
      for (let i = 0; i < count; i++) {
        const tongue = tongues[i];
        if (!tongue) continue;
        const x = ((i + 0.5 + (tongue.at - 0.5) * 0.6) / count) * w;
        const height = h * 0.2 * tongue.size * (0.75 + 0.25 * Math.sin(t * 5 + tongue.phase));
        const half = h * 0.045;
        const sway = Math.sin(t * 3.1 + tongue.phase) * half * 0.6;
        const gradient = ctx.createLinearGradient(x, floor, x, floor - height);
        gradient.addColorStop(0, 'rgb(255 220 120 / 0.85)');
        gradient.addColorStop(0.45, 'rgb(255 130 50 / 0.65)');
        gradient.addColorStop(1, 'rgb(200 50 20 / 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(x - half, floor);
        ctx.quadraticCurveTo(x - half * 0.8 + sway, floor - height * 0.6, x + sway * 1.6, floor - height);
        ctx.quadraticCurveTo(x + half * 0.8 + sway, floor - height * 0.6, x + half, floor);
        ctx.closePath();
        ctx.fill();
      }
      for (const e of embers) {
        const life = (e.p + t * e.v) % 1;
        const x = e.x * w + Math.sin(t * 1.3 + e.s * 9) * h * 0.03 * life;
        const y = floor - life * h * 0.6;
        const r = Math.max(1, (1 + e.s * 2) * (h / 900));
        ctx.fillStyle = `rgb(255 ${String(150 + Math.round(e.s * 80))} 80 / ${String((1 - life) * 0.9)})`;
        ctx.fillRect(x, y, r, r);
      }
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}

function night(ctx: Ctx): SceneArt {
  const rand = seeded(37);
  const scene = base(ctx, (s, w, h) => {
    s.fillStyle = vertical(s, h, [
      [0, '#070b1a'],
      [0.6, '#111a3a'],
      [1, '#24305a'],
    ]);
    s.fillRect(0, 0, w, h);
    // A faint band of distant stars.
    const dust = seeded(3);
    for (let i = 0; i < 900; i++) {
      const u = dust();
      const x = u * w;
      const y = h * (0.7 - u * 0.55) + (dust() - 0.5) * h * 0.18;
      s.fillStyle = `rgb(220 225 255 / ${String(0.05 + dust() * 0.12)})`;
      s.fillRect(x, y, 1, 1);
    }
    // The page covers the middle, so the moon sits near the edge.
    const mx = w * 0.88;
    const my = h * 0.16;
    const mr = Math.min(w, h) * 0.045;
    glow(s, mx, my, mr * 5, 'rgb(242 236 216 / 0.18)');
    s.fillStyle = '#f2ecd8';
    s.beginPath();
    s.arc(mx, my, mr, 0, Math.PI * 2);
    s.fill();
    hills(s, w, h, h * 0.8, h * 0.05, '#0b1022', 1.2);
    hills(s, w, h, h * 0.88, h * 0.04, '#05070f', 3.1);
  });
  const stars = Array.from({ length: 190 }, () => ({
    x: rand(),
    y: rand() * 0.75,
    r: rand(),
    speed: 0.5 + rand() * 2,
    phase: rand() * 6,
  }));
  return {
    resize: scene.resize,
    draw(t) {
      const { w, h } = scene.size;
      const k = Math.max(1, h / 900);
      scene.still();
      for (const star of stars) {
        const alpha = 0.45 + 0.4 * Math.sin(t * star.speed + star.phase);
        ctx.fillStyle = `rgb(235 238 255 / ${String(Math.max(0.08, alpha))})`;
        const r = (0.8 + star.r * 1.4) * k;
        ctx.fillRect(star.x * w, star.y * h, r, r);
      }
      // A shooting star crosses for one second in every eight.
      const cycle = t % 8;
      if (cycle < 1) {
        const n = Math.floor(t / 8);
        const pick = seeded(n + 99);
        const sx = w * (0.15 + pick() * 0.5);
        const sy = h * (0.08 + pick() * 0.25);
        const x = sx + cycle * w * 0.25;
        const y = sy + cycle * h * 0.12;
        const gradient = ctx.createLinearGradient(x, y, x - w * 0.08, y - h * 0.04);
        gradient.addColorStop(0, `rgb(255 255 255 / ${String(0.9 * (1 - cycle))})`);
        gradient.addColorStop(1, 'rgb(255 255 255 / 0)');
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.5 * k;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - w * 0.08, y - h * 0.04);
        ctx.stroke();
      }
    },
  };
}

function forest(ctx: Ctx): SceneArt {
  const rand = seeded(53);
  const scene = base(ctx, (s, w, h) => {
    s.fillStyle = vertical(s, h, [
      [0, '#2f5444'],
      [0.55, '#1d3a2f'],
      [1, '#0f1f1a'],
    ]);
    s.fillRect(0, 0, w, h);
    const trees = seeded(8);
    const layers: [number, string, number][] = [
      [0.62, '#24453a', 0.32],
      [0.74, '#173229', 0.42],
      [0.9, '#0c1a15', 0.55],
    ];
    for (const [ground, color, size] of layers) {
      const count = Math.ceil(w / (h * size * 0.32));
      for (let i = 0; i <= count; i++) {
        const x = (i + trees() * 0.6) * (w / count);
        pine(s, x, h * ground + trees() * h * 0.03, h * size * (0.7 + trees() * 0.4), color);
      }
      s.fillStyle = color;
      s.fillRect(0, h * ground, w, h * (1 - ground));
    }
  });
  const flies = Array.from({ length: 36 }, () => ({
    x: rand(),
    y: 0.45 + rand() * 0.5,
    a: rand() * 6,
    b: rand() * 6,
    s: 0.2 + rand() * 0.4,
  }));
  return {
    resize: scene.resize,
    draw(t) {
      const { w, h } = scene.size;
      scene.still();
      // Mist drifts slowly across the middle trees.
      const mx = ((t * 0.01) % 1.4) * w * 1.2 - w * 0.4;
      ctx.fillStyle = 'rgb(190 220 205 / 0.06)';
      ctx.beginPath();
      ctx.ellipse(mx + w * 0.3, h * 0.7, w * 0.45, h * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      for (const f of flies) {
        const x = (f.x + Math.sin(t * f.s + f.a) * 0.03) * w;
        const y = (f.y + Math.cos(t * f.s * 0.8 + f.b) * 0.025) * h;
        const pulse = 0.5 + 0.5 * Math.sin(t * 2 * f.s + f.a * 3);
        glow(ctx, x, y, (6 + pulse * 6) * (h / 900), `rgb(220 255 140 / ${String(0.15 + pulse * 0.55)})`);
      }
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}

function snow(ctx: Ctx): SceneArt {
  const rand = seeded(71);
  const cabin = { x: 0.87, ground: 0.78 };
  const scene = base(ctx, (s, w, h) => {
    s.fillStyle = vertical(s, h, [
      [0, '#1c2a44'],
      [0.55, '#3a4f72'],
      [0.8, '#8aa0bf'],
      [1, '#a9b9d0'],
    ]);
    s.fillRect(0, 0, w, h);
    hills(s, w, h, h * 0.72, h * 0.04, '#c5d1e2', 0.4);
    const trees = seeded(4);
    for (let i = 0; i < 9; i++) {
      const x = trees() * w;
      if (Math.abs(x - cabin.x * w) < h * 0.16) continue;
      pine(s, x, h * (0.74 + trees() * 0.05), h * (0.16 + trees() * 0.1), '#1d2a3d');
    }
    hills(s, w, h, h * cabin.ground, h * 0.025, '#dfe7f2', 2.2);
    // The cabin.
    const cw = h * 0.16;
    const cx = cabin.x * w;
    const cy = h * cabin.ground;
    s.fillStyle = '#141a26';
    s.fillRect(cx - cw / 2, cy - cw * 0.55, cw, cw * 0.58);
    s.fillRect(cx + cw * 0.22, cy - cw * 0.95, cw * 0.1, cw * 0.3);
    s.fillStyle = '#eef3f9';
    s.beginPath();
    s.moveTo(cx - cw * 0.62, cy - cw * 0.5);
    s.lineTo(cx, cy - cw * 0.92);
    s.lineTo(cx + cw * 0.62, cy - cw * 0.5);
    s.closePath();
    s.fill();
  });
  const flakes = Array.from({ length: 170 }, () => ({
    x: rand(),
    y: rand(),
    r: rand(),
    v: 0.03 + rand() * 0.05,
    p: rand() * 6,
  }));
  return {
    resize: scene.resize,
    draw(t) {
      const { w, h } = scene.size;
      const k = h / 900;
      scene.still();
      const cw = h * 0.16;
      const wx = cabin.x * w - cw * 0.12;
      const wy = h * cabin.ground - cw * 0.3;
      const warm = 0.85 + Math.sin(t * 2.1) * 0.08 + Math.sin(t * 5.3) * 0.04;
      glow(ctx, wx, wy, cw * 0.7 * warm, 'rgb(255 207 122 / 0.35)');
      ctx.fillStyle = '#ffcf7a';
      ctx.fillRect(wx - cw * 0.08, wy - cw * 0.08, cw * 0.16, cw * 0.14);
      ctx.fillStyle = 'rgb(255 255 255 / 0.85)';
      for (const f of flakes) {
        const y = ((f.y + t * f.v) % 1.05) * h - 0.02 * h;
        const x = (f.x * w + Math.sin(t * 0.8 + f.p) * 18 * k + w) % w;
        const r = (1 + f.r * 2.5) * k;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.8, r), 0, Math.PI * 2);
        ctx.fill();
      }
    },
  };
}

/** The page covers the middle of the scene, so the sun sets near the right edge. */
const SUN_X = 0.86;

function ocean(ctx: Ctx): SceneArt {
  const rand = seeded(97);
  const horizon = 0.6;
  const scene = base(ctx, (s, w, h) => {
    s.fillStyle = vertical(s, h * horizon, [
      [0, '#2b2350'],
      [0.55, '#6b3f6e'],
      [0.88, '#e0866a'],
      [1, '#f6c27a'],
    ]);
    s.fillRect(0, 0, w, h * horizon);
    const sx = w * SUN_X;
    const sy = h * horizon;
    const sr = Math.min(w, h) * 0.07;
    glow(s, sx, sy, sr * 4, 'rgb(255 200 140 / 0.35)');
    s.fillStyle = '#ffd9a0';
    s.beginPath();
    s.arc(sx, sy, sr, Math.PI, 0);
    s.fill();
    const sea = s.createLinearGradient(0, h * horizon, 0, h);
    sea.addColorStop(0, '#5a3d64');
    sea.addColorStop(0.4, '#3a2c55');
    sea.addColorStop(1, '#1a1833');
    s.fillStyle = sea;
    s.fillRect(0, h * horizon, w, h * (1 - horizon));
  });
  const glints = Array.from({ length: 70 }, () => ({
    y: rand(),
    x: rand() - 0.5,
    len: 0.3 + rand(),
    p: rand() * 6,
  }));
  return {
    resize: scene.resize,
    draw(t) {
      const { w, h } = scene.size;
      const k = h / 900;
      scene.still();
      const top = h * horizon;
      // Slow wave lines across the sea.
      ctx.strokeStyle = 'rgb(255 220 200 / 0.08)';
      ctx.lineWidth = Math.max(1, k);
      for (let i = 1; i < 9; i++) {
        const y = top + (h - top) * (i / 9) ** 1.4;
        ctx.beginPath();
        for (let x = 0; x <= w; x += Math.max(8, w / 80)) {
          const yy = y + Math.sin(x / (w * 0.08) + t * 0.6 + i) * 2.5 * k * i * 0.4;
          if (x === 0) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      // The sun's path on the water.
      for (const g of glints) {
        const depth = g.y ** 1.3;
        const y = top + 4 * k + depth * (h - top) * 0.9;
        const spread = (0.04 + depth * 0.16) * w;
        const x = w * SUN_X + g.x * spread;
        const alpha = 0.25 + 0.35 * Math.sin(t * 1.7 + g.p);
        if (alpha <= 0) continue;
        ctx.fillStyle = `rgb(255 214 160 / ${String(alpha * (1 - depth * 0.6))})`;
        ctx.fillRect(x, y, g.len * 26 * k * (0.4 + depth), Math.max(1, 1.5 * k));
      }
    },
  };
}

const MAKERS: Readonly<Record<SceneId, (ctx: Ctx) => SceneArt>> = {
  rain,
  fireplace,
  night,
  forest,
  snow,
  ocean,
};

export function createArt(id: SceneId, ctx: Ctx): SceneArt {
  return MAKERS[id](ctx);
}

/** The time Vlo draws for a still scene: late enough that every moving part is spread out. */
export const STILL_TIME = 12.5;
