import type { SceneId } from './scenes';

/*
 * The motion over each scene's photograph, drawn with the canvas 2D API on a clear canvas. The photograph is
 * the canvas's CSS background, so the canvas only adds light that moves: drops on the glass, sparks, stars,
 * fireflies, snow and glints. The same code runs in the scene worker with an OffscreenCanvas and on the
 * main thread with a canvas element. Each scene makes its soft dots (sprites) once per size, and each frame
 * clears the canvas and copies sprites, which costs far less than a gradient per dot.
 */

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Surface = HTMLCanvasElement | OffscreenCanvas;

export interface SceneArt {
  /** Makes the sprites for a canvas of this size in device pixels. */
  resize: (width: number, height: number) => void;
  /** Draws the motion at `t` seconds. */
  draw: (t: number) => void;
}

/** The time Vlo draws for a still scene: late enough that every moving part is spread out. */
export const STILL_TIME = 12.5;

/** Width over height of every scene photograph (src/assets/backdrops). */
const PHOTO_ASPECT = 1.5;

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

/**
 * The 2D context of a canvas or an offscreen canvas. Each type gets its own call, because TypeScript can
 * pick the wrong getContext overload on the union, depending on the order it checks files.
 */
export function context2d(target: Surface): Ctx | null {
  return 'transferControlToOffscreen' in target ? target.getContext('2d') : target.getContext('2d');
}

function context(target: Surface): Ctx {
  const ctx = context2d(target);
  if (!ctx) throw new Error('No 2D canvas context');
  return ctx;
}

/** A soft round dot of `color` ("r g b"), `r` pixels wide to its faint edge. */
function dot(r: number, color: string, core = 0.18): Surface {
  const size = Math.max(2, Math.ceil(r * 2));
  const sprite = surface(size, size);
  const s = context(sprite);
  const g = s.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgb(${color} / 1)`);
  g.addColorStop(core, `rgb(${color} / 0.85)`);
  g.addColorStop(0.45, `rgb(${color} / 0.22)`);
  g.addColorStop(1, `rgb(${color} / 0)`);
  s.fillStyle = g;
  s.fillRect(0, 0, size, size);
  return sprite;
}

/** Draws a sprite centered on (x, y) at `alpha`, `scale` times its size. */
function stamp(ctx: Ctx, sprite: Surface, x: number, y: number, alpha: number, scale = 1): void {
  if (alpha <= 0.005) return;
  const w = sprite.width * scale;
  const h = sprite.height * scale;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(sprite, x - w / 2, y - h / 2, w, h);
}

/** Where a point of the photograph lands on the canvas: the photograph covers the canvas, centered. */
interface Frame {
  w: number;
  h: number;
  /** Pixels per photo-width unit, so sizes follow the photograph. */
  scale: number;
  x: (u: number) => number;
  y: (v: number) => number;
}

function frameFor(w: number, h: number): Frame {
  const photoW = Math.max(w, h * PHOTO_ASPECT);
  const photoH = photoW / PHOTO_ASPECT;
  const left = (w - photoW) / 2;
  const top = (h - photoH) / 2;
  return { w, h, scale: photoW, x: (u) => left + u * photoW, y: (v) => top + v * photoH };
}

/** A smooth pulse from 0 to 1 and back, `width` of each cycle long, once per `period` seconds. */
function pulse(t: number, period: number, phase: number, width: number): number {
  const at = (((t / period + phase) % 1) + 1) % 1;
  if (at > width) return 0;
  return Math.sin((at / width) * Math.PI) ** 2;
}

/**
 * The plumbing every scene shares: the frame, sprites made once per size, and a clear canvas each draw.
 * `sprites` makes the scene's sprites for a frame; `paint` draws one moment with them.
 */
function scene<S>(
  ctx: Ctx,
  sprites: (frame: Frame) => S,
  paint: (frame: Frame, s: S, t: number) => void,
): SceneArt {
  let frame = frameFor(1, 1);
  let made: S | null = null;
  return {
    resize(width, height) {
      frame = frameFor(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
      made = sprites(frame);
    },
    draw(t) {
      ctx.clearRect(0, 0, frame.w, frame.h);
      if (!made) return;
      ctx.save();
      paint(frame, made, t);
      ctx.restore();
    },
  };
}

/** Drops of rain that cling to the glass, then run down it, now and then. */
function rain(ctx: Ctx): SceneArt {
  const rand = seeded(11);
  const drops = Array.from({ length: 18 }, () => ({
    u: 0.02 + rand() * 0.96,
    v: rand() * 0.8,
    size: 0.7 + rand() * 0.6,
    period: 7 + rand() * 9,
    phase: rand(),
    run: 0.12 + rand() * 0.22,
  }));
  return scene(
    ctx,
    (f) => {
      const r = Math.max(2, f.scale * 0.0028);
      const sprite = surface(Math.ceil(r * 2.4), Math.ceil(r * 2.8));
      const s = context(sprite);
      const cx = sprite.width / 2;
      const cy = sprite.height * 0.55;
      // A drop bends the light behind it: a faint dark body, a thin bright edge below, and a glint above.
      s.fillStyle = 'rgb(10 8 6 / 0.22)';
      s.beginPath();
      s.ellipse(cx, cy, r * 0.85, r, 0, 0, Math.PI * 2);
      s.fill();
      s.strokeStyle = 'rgb(255 222 180 / 0.6)';
      s.lineWidth = Math.max(1, r * 0.18);
      s.beginPath();
      s.ellipse(cx, cy, r * 0.78, r * 0.92, 0, Math.PI * 0.15, Math.PI * 0.85);
      s.stroke();
      s.fillStyle = 'rgb(255 255 255 / 0.8)';
      s.beginPath();
      s.ellipse(cx - r * 0.3, cy - r * 0.42, r * 0.14, r * 0.2, -0.5, 0, Math.PI * 2);
      s.fill();
      return { sprite, r };
    },
    (f, { sprite, r }, t) => {
      for (const d of drops) {
        // Each cycle the drop rests, then runs down the glass, then the next drop takes its place.
        const at = (((t / d.period + d.phase) % 1) + 1) % 1;
        const moving = Math.max(0, (at - 0.55) / 0.45);
        const travel = d.run * moving ** 1.6;
        const x = f.x(d.u) + Math.sin(travel * 40 + d.phase * 9) * r * 0.5;
        const y = f.y(d.v + travel);
        const fade = Math.min(1, at / 0.08) * Math.min(1, (1 - at) / 0.05);
        // A short wet streak stays behind a running drop and fades toward its top.
        const streak = Math.min(y - f.y(d.v), r * 10);
        if (streak > r) {
          const wet = ctx.createLinearGradient(x, y - streak, x, y);
          wet.addColorStop(0, 'rgb(255 228 196 / 0)');
          wet.addColorStop(1, 'rgb(255 228 196 / 0.28)');
          ctx.globalAlpha = fade;
          ctx.fillStyle = wet;
          ctx.fillRect(x - r * 0.22, y - streak, r * 0.44, streak);
        }
        stamp(ctx, sprite, x, y, fade, d.size);
      }
    },
  );
}

/** Sparks that rise from the fire and fade, and the fire's light, which flickers. */
function fireplace(ctx: Ctx): SceneArt {
  const rand = seeded(23);
  const sparks = Array.from({ length: 70 }, () => ({
    u: rand(),
    speed: 0.05 + rand() * 0.09,
    phase: rand(),
    sway: 0.01 + rand() * 0.03,
    size: 0.4 + rand() * 0.9,
    warm: rand(),
  }));
  return scene(
    ctx,
    (f) => {
      const r = f.scale * 0.004;
      const glow = surface(Math.max(2, Math.round(f.w / 4)), Math.max(2, Math.round(f.h / 4)));
      const g = context(glow);
      const gradient = g.createRadialGradient(
        glow.width * 0.5,
        glow.height * 1.05,
        0,
        glow.width * 0.5,
        glow.height * 1.05,
        glow.height * 1.1,
      );
      gradient.addColorStop(0, 'rgb(255 140 40 / 0.5)');
      gradient.addColorStop(1, 'rgb(255 120 30 / 0)');
      g.fillStyle = gradient;
      g.fillRect(0, 0, glow.width, glow.height);
      return { hot: dot(r, '255 214 140', 0.25), warm: dot(r, '255 150 60', 0.2), glow };
    },
    (f, { hot, warm, glow }, t) => {
      const flicker =
        0.55 + 0.18 * Math.sin(t * 7.1) + 0.12 * Math.sin(t * 13.3 + 1) + 0.1 * Math.sin(t * 3.7);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.22 * flicker;
      ctx.drawImage(glow, 0, 0, f.w, f.h);
      for (const s of sparks) {
        const life = (((t * s.speed + s.phase) % 1) + 1) % 1;
        const y = f.h * (1.02 - life * 1.05);
        const x =
          f.x(s.u) + Math.sin(t * 1.3 + s.phase * 20) * f.scale * s.sway * life - life * f.scale * 0.04;
        const twinkle = 0.65 + 0.35 * Math.sin(t * 9 + s.phase * 50);
        const alpha = (1 - life) ** 1.4 * twinkle;
        stamp(ctx, s.warm > 0.5 ? hot : warm, x, y, alpha, s.size * (1 - life * 0.5));
      }
    },
  );
}

/** A few stars that twinkle over the photograph's own, and now and then a shooting star. */
function night(ctx: Ctx): SceneArt {
  const rand = seeded(37);
  const stars = Array.from({ length: 44 }, () => ({
    u: rand(),
    v: rand() * 0.62,
    size: 0.4 + rand() * 0.8,
    speed: 0.6 + rand() * 1.8,
    phase: rand() * 10,
    blue: rand() > 0.6,
  }));
  return scene(
    ctx,
    (f) => {
      const r = f.scale * 0.003;
      return { white: dot(r, '255 250 240', 0.12), blue: dot(r, '205 220 255', 0.12) };
    },
    (f, { white, blue }, t) => {
      ctx.globalCompositeOperation = 'lighter';
      for (const s of stars) {
        const shine = (0.5 + 0.5 * Math.sin(t * s.speed + s.phase)) ** 3;
        stamp(ctx, s.blue ? blue : white, f.x(s.u), f.y(s.v), 0.15 + 0.75 * shine, s.size);
      }
      // A shooting star crosses the upper sky once every 11 seconds, for under a second.
      const at = (((t / 11 + 0.3) % 1) + 1) % 1;
      if (at < 0.07) {
        const cycle = Math.floor(t / 11 + 0.3);
        const from = seeded(cycle + 101);
        const u0 = 0.1 + from() * 0.6;
        const v0 = 0.05 + from() * 0.2;
        const k = at / 0.07;
        const x = f.x(u0 + k * 0.22);
        const y = f.y(v0 + k * 0.09);
        const tail = f.scale * 0.07;
        const tx = x - tail * 0.92;
        const ty = y - tail * 0.37;
        const line = ctx.createLinearGradient(tx, ty, x, y);
        line.addColorStop(0, 'rgb(255 255 255 / 0)');
        line.addColorStop(1, `rgb(255 255 255 / ${String(0.85 * Math.sin(k * Math.PI))})`);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = line;
        ctx.lineWidth = Math.max(1, f.scale * 0.0011);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    },
  );
}

/** Fireflies that wander and blink, and low mist that drifts across the wood. */
function forest(ctx: Ctx): SceneArt {
  const rand = seeded(53);
  const flies = Array.from({ length: 30 }, () => ({
    u: rand(),
    v: 0.45 + rand() * 0.5,
    reach: 0.02 + rand() * 0.05,
    speed: 0.08 + rand() * 0.14,
    phase: rand() * 10,
    period: 2.8 + rand() * 4,
    size: 0.6 + rand() * 0.8,
  }));
  return scene(
    ctx,
    (f) => {
      const mist = surface(Math.max(2, Math.round(f.w / 3)), Math.max(2, Math.round(f.h / 6)));
      const m = context(mist);
      const g = m.createRadialGradient(
        mist.width / 2,
        mist.height / 2,
        0,
        mist.width / 2,
        mist.height / 2,
        mist.width / 2,
      );
      g.addColorStop(0, 'rgb(214 222 210 / 0.5)');
      g.addColorStop(1, 'rgb(214 222 210 / 0)');
      m.setTransform(1, 0, 0, 0.3, 0, mist.height * 0.35);
      m.fillStyle = g;
      m.fillRect(0, 0, mist.width, mist.width);
      return { fly: dot(f.scale * 0.006, '226 240 140', 0.1), mist };
    },
    (f, { fly, mist }, t) => {
      for (let i = 0; i < 3; i++) {
        const drift = ((((t * 0.012 + i / 3) % 1) + 1) % 1) * 1.6 - 0.3;
        ctx.globalAlpha = 0.16;
        ctx.drawImage(mist, f.w * drift - f.w * 0.5, f.y(0.62 + i * 0.1) - f.h * 0.08, f.w, f.h * 0.16);
      }
      ctx.globalCompositeOperation = 'lighter';
      for (const fl of flies) {
        const a = t * fl.speed + fl.phase;
        const x = f.x(fl.u + Math.sin(a) * fl.reach + Math.sin(a * 2.3) * fl.reach * 0.4);
        const y = f.y(fl.v + Math.cos(a * 0.8) * fl.reach * 0.6);
        stamp(ctx, fly, x, y, pulse(t, fl.period, fl.phase, 0.42), fl.size);
      }
    },
  );
}

/** Snow in three depths: small far flakes, and large soft ones close to the glass. */
function snow(ctx: Ctx): SceneArt {
  const rand = seeded(71);
  const layers = [
    { count: 90, size: 0.0024, fall: 0.035, sway: 0.006, alpha: 0.75 },
    { count: 46, size: 0.0045, fall: 0.06, sway: 0.012, alpha: 0.7 },
    { count: 14, size: 0.011, fall: 0.11, sway: 0.02, alpha: 0.4 },
  ].map((layer) => ({
    ...layer,
    flakes: Array.from({ length: layer.count }, () => ({
      x: rand(),
      y: rand(),
      phase: rand() * 10,
      speed: 0.8 + rand() * 0.4,
    })),
  }));
  return scene(
    ctx,
    (f) => layers.map((layer, i) => dot(f.scale * layer.size, '250 252 255', i === 2 ? 0.05 : 0.35)),
    (f, sprites, t) => {
      layers.forEach((layer, i) => {
        const sprite = sprites[i];
        if (!sprite) return;
        for (const s of layer.flakes) {
          const y = (((s.y + t * layer.fall * s.speed) % 1.1) + 1.1) % 1.1;
          const x = s.x * f.w + Math.sin(t * 0.6 + s.phase) * f.scale * layer.sway;
          stamp(ctx, sprite, x, (y - 0.05) * f.h, layer.alpha);
        }
      });
    },
  );
}

/** Light that glints on the waves and the wet sand. */
function ocean(ctx: Ctx): SceneArt {
  const rand = seeded(89);
  const glints = Array.from({ length: 70 }, () => {
    const v = 0.58 + rand() * 0.36;
    return {
      // The water and the wet sand narrow toward the dark shore on the right.
      u: rand() * (0.55 + (v - 0.58) * 0.4),
      v,
      period: 1.6 + rand() * 2.4,
      phase: rand(),
      size: 0.5 + rand() * 0.9,
    };
  });
  return scene(
    ctx,
    (f) => ({ glint: dot(f.scale * 0.004, '255 236 200', 0.2) }),
    (f, { glint }, t) => {
      ctx.globalCompositeOperation = 'lighter';
      for (const g of glints) {
        const x = f.x(g.u + Math.sin(t * 0.4 + g.phase * 6) * 0.004);
        stamp(ctx, glint, x, f.y(g.v), 0.85 * pulse(t, g.period, g.phase, 0.3), g.size);
      }
    },
  );
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
