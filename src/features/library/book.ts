import type { Project, Template } from '@/lib/db';

/** FNV-1a: the same seed always gives the same number. */
export function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Book cloths. Each pairs a spine color with the ink of its lettering and a foil for its bands. */
const CLOTHS = [
  { spine: '#5b2a2a', ink: '#f2e9dc', band: '#c8a96a' }, // oxblood
  { spine: '#22324a', ink: '#ece7dc', band: '#b9c7d8' }, // navy
  { spine: '#1f3a2f', ink: '#e9efe6', band: '#a9d4b3' }, // forest
  { spine: '#3d3150', ink: '#efe8f2', band: '#cdb6e0' }, // plum
  { spine: '#8a5a24', ink: '#fbf3e4', band: '#f1d39a' }, // ochre
  { spine: '#a9d4b3', ink: '#14231a', band: '#4d7758' }, // celadon
  { spine: '#e8e1d2', ink: '#241f19', band: '#8a3b2e' }, // bone
  { spine: '#8a3b2e', ink: '#fbefe6', band: '#e9c7a4' }, // rust
  { spine: '#2b2b30', ink: '#e7e3dc', band: '#a9d4b3' }, // charcoal
  { spine: '#c2ad84', ink: '#2b2418', band: '#5b2a2a' }, // linen
  { spine: '#5f7484', ink: '#f1f3f4', band: '#dfe8ee' }, // slate blue
  { spine: '#d9c9dc', ink: '#2c2231', band: '#3d3150' }, // lilac
] as const;

/** A rough page height for each kind of work, in pixels. A script is tall, and poems are small books. */
const HEIGHT: Record<Template, number> = {
  novel: 300,
  memoir: 286,
  poetry: 256,
  open: 276,
  script: 312,
  essay: 266,
  article: 258,
  research: 296,
};

export type Finish = 'cloth' | 'gloss' | 'matte';
export type Face = 'display' | 'manuscript' | 'mono';

export interface BookLook {
  spine: string;
  ink: string;
  band: string;
  finish: Finish;
  face: Face;
  caps: boolean;
  /** Spine width in pixels: more words make a thicker book. */
  width: number;
  /** Spine height in pixels. */
  height: number;
  /** Degrees that the book leans on the shelf. */
  lean: number;
  /** Pixels that the book sits forward (+) or back (−) on the shelf. */
  depth: number;
}

const FINISHES: readonly Finish[] = ['cloth', 'gloss', 'matte'];
const FACES: readonly Face[] = ['display', 'manuscript', 'mono'];

/**
 * How a project looks as a book on the shelf. Each value comes from the project id, so a book keeps its look,
 * and from the word count, so a book grows thicker as the writer writes.
 */
export function bookLook(project: Pick<Project, 'id' | 'templates'>, wordCount: number): BookLook {
  const h = hash(project.id);
  const cloth = CLOTHS[h % CLOTHS.length] ?? CLOTHS[0];
  const base = HEIGHT[project.templates[0] ?? 'open'];
  return {
    ...cloth,
    finish: FINISHES[(h >>> 4) % FINISHES.length] ?? 'cloth',
    face: FACES[(h >>> 6) % FACES.length] ?? 'display',
    caps: ((h >>> 8) & 3) === 0,
    width: Math.round(Math.min(76, 36 + Math.sqrt(Math.max(0, wordCount)) * 0.13)),
    height: base + (((h >>> 10) % 21) - 10),
    // Most books stand straight. One in four leans a little.
    lean: ((h >>> 15) & 3) === 0 ? -(1 + ((h >>> 17) % 4)) : 0,
    depth: ((h >>> 20) % 13) - 6,
  };
}
