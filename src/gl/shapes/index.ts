import { createRandom } from "../random";

/**
 * Particle targets for the seven shapes of spec 18.2. Every shape fills `count * 3` floats in
 * one unit space: x and y in -1..1, z in -0.5..0.5. Pure functions, so they run in tests.
 */
export const SHAPE_NAMES = [
  "wordmark",
  "cloud",
  "book",
  "formations",
  "padlock",
  "plane",
  "footer",
] as const;

/** An alpha bitmap of the wordmark, drawn by the browser (see `drawWordmarkMask`). */
export interface Mask {
  width: number;
  height: number;
  alpha: Uint8Array;
}

type Random = () => number;
type Put = (i: number, x: number, y: number, z: number) => void;

const WORDMARK_WIDTH = 1.6;

/** World units per mask pixel, so the wordmark spans WORDMARK_WIDTH. */
export function maskScale(mask: Mask): number {
  return WORDMARK_WIDTH / mask.width;
}

function wordmark(count: number, put: Put, random: Random, mask: Mask, depth: number) {
  const filled: number[] = [];
  for (let i = 0; i < mask.alpha.length; i++) if (mask.alpha[i]! > 127) filled.push(i);
  const scale = maskScale(mask);
  for (let i = 0; i < count; i++) {
    const pixel = filled[Math.floor(random() * filled.length)] ?? 0;
    const px = (pixel % mask.width) + random();
    const py = Math.floor(pixel / mask.width) + random();
    put(i, (px - mask.width / 2) * scale, (mask.height / 2 - py) * scale, (random() - 0.5) * depth);
  }
}

/** Loose "words": short horizontal clusters scattered over the screen. */
function cloud(count: number, put: Put, random: Random) {
  const words = 90;
  const centers = Array.from({ length: words }, () => ({
    x: (random() * 2 - 1) * 0.85,
    y: (random() * 2 - 1) * 0.8,
    length: 0.04 + random() * 0.12,
    z: (random() - 0.5) * 0.8,
  }));
  for (let i = 0; i < count; i++) {
    const word = centers[i % words]!;
    put(i, word.x + random() * word.length, word.y + (random() - 0.5) * 0.02, word.z);
  }
}

/** An open book: two curved page stacks, with the top pages lifting and fanning apart. */
function book(count: number, put: Put, random: Random) {
  for (let i = 0; i < count; i++) {
    const side = random() < 0.5 ? -1 : 1;
    const page = Math.floor(random() * 12); // 0 is the bottom page
    const u = random(); // 0 at the spine, 1 at the fore-edge
    const v = random() * 2 - 1; // top to bottom
    const lift = Math.max(0, page - 8) * 0.12; // the top three pages fan up
    const angle = 0.18 + lift + u * 0.05;
    const x = side * u * 0.7 * Math.cos(angle);
    const z = u * 0.7 * Math.sin(angle) * 0.6 + page * 0.006 - 0.25;
    put(i, x, v * 0.5, Math.max(-0.5, Math.min(0.5, z)));
  }
}

/** A grid of scene cards, a curved ribbon and indented stanza lines (novel, memoir, poetry). */
function formations(count: number, put: Put, random: Random) {
  for (let i = 0; i < count; i++) {
    const kind = i % 3;
    if (kind === 0) {
      const card = Math.floor(random() * 9);
      const cx = -0.75 + (card % 3) * 0.17;
      const cy = 0.2 - Math.floor(card / 3) * 0.22;
      put(i, cx + random() * 0.13, cy + random() * 0.17, 0);
    } else if (kind === 1) {
      const t = random();
      const width = (random() - 0.5) * 0.06;
      put(
        i,
        -0.15 + t * 0.3 + width,
        Math.sin(t * Math.PI * 2) * 0.3,
        Math.cos(t * Math.PI * 2) * 0.2,
      );
    } else {
      const line = Math.floor(random() * 8);
      const indent = [0, 0.04, 0.08, 0.16, 0, 0.04, 0.12, 0][line]!;
      put(i, 0.38 + indent + random() * (0.3 - indent), 0.3 - line * 0.09, 0);
    }
  }
}

/** A padlock: a rounded body and an arched shackle. */
function padlock(count: number, put: Put, random: Random) {
  for (let i = 0; i < count; i++) {
    if (random() < 0.7) {
      put(i, (random() - 0.5) * 0.6, -0.55 + random() * 0.45, (random() - 0.5) * 0.12);
    } else {
      const angle = random() * Math.PI;
      const radius = 0.2 + random() * 0.05;
      const leg = random() < 0.3 ? random() * 0.12 : 0;
      put(i, Math.cos(angle) * radius, -0.1 + leg + Math.sin(angle) * radius + 0.12, 0);
    }
  }
}

/** A paper plane: four triangles (two wings and the two halves of the keel). */
function plane(count: number, put: Put, random: Random) {
  const nose: [number, number, number] = [0.7, 0.15, 0];
  const tris: [number, number, number][][] = [
    [nose, [-0.5, 0.05, 0.4], [-0.45, 0.1, 0]],
    [nose, [-0.5, 0.05, -0.4], [-0.45, 0.1, 0]],
    [nose, [-0.45, 0.1, 0], [-0.4, -0.2, 0.05]],
    [nose, [-0.45, 0.1, 0], [-0.4, -0.2, -0.05]],
  ];
  for (let i = 0; i < count; i++) {
    const [a, b, c] = tris[i % 4]!;
    let r1 = random();
    let r2 = random();
    if (r1 + r2 > 1) [r1, r2] = [1 - r1, 1 - r2];
    const at = (k: number) => a![k]! + r1 * (b![k]! - a![k]!) + r2 * (c![k]! - a![k]!);
    put(i, at(0), at(1), at(2));
  }
}

export function sampleShapes({
  count,
  seed,
  wordmark: mask,
}: {
  count: number;
  seed: number;
  wordmark: Mask;
}): Float32Array[] {
  const random = createRandom(seed);
  return SHAPE_NAMES.map((name) => {
    const out = new Float32Array(count * 3);
    const put: Put = (i, x, y, z) => {
      out[i * 3] = Math.max(-1, Math.min(1, x));
      out[i * 3 + 1] = Math.max(-1, Math.min(1, y));
      out[i * 3 + 2] = Math.max(-0.5, Math.min(0.5, z));
    };
    if (name === "wordmark") wordmark(count, put, random, mask, 0.15);
    else if (name === "cloud") cloud(count, put, random);
    else if (name === "book") book(count, put, random);
    else if (name === "formations") formations(count, put, random);
    else if (name === "padlock") padlock(count, put, random);
    else if (name === "plane") plane(count, put, random);
    else wordmark(count, put, random, mask, 0.02);
    return out;
  });
}
