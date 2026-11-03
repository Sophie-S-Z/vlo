import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

/* The fixtures match VLO_SPEC section 15, so later phases can rely on their shape. */

interface NovelFixture {
  chapters: { title: string; scenes: { title: string; file: string; threads: string[] }[] }[];
  threads: { name: string }[];
  cards: { title: string; scene: string }[];
}

const novel = JSON.parse(readFileSync('tests/fixtures/novel/project.json', 'utf8')) as NovelFixture;
const scenes = novel.chapters.flatMap((c) => c.scenes);

test('the novel fixture has three chapters of two scenes, two threads and six cards', () => {
  expect(novel.chapters).toHaveLength(3);
  expect(novel.chapters.every((c) => c.scenes.length === 2)).toBe(true);
  expect(novel.threads.map((t) => t.name)).toEqual(["Mira's debt", 'The lighthouse']);
  expect(novel.cards).toHaveLength(6);
  const files = new Set(scenes.map((s) => s.file));
  expect(novel.cards.every((card) => files.has(card.scene))).toBe(true);
  const threadNames = new Set(novel.threads.map((t) => t.name));
  expect(scenes.every((s) => s.threads.every((name) => threadNames.has(name)))).toBe(true);
});

test('each novel scene file exists, and exactly one holds a scene break', () => {
  const bodies = scenes.map((s) => {
    const path = `tests/fixtures/novel/${s.file}`;
    expect(existsSync(path)).toBe(true);
    return readFileSync(path, 'utf8');
  });
  expect(bodies.filter((body) => /^\*\*\*$/m.test(body))).toHaveLength(1);
});

test('the memoir fixture names every real person the alias test replaces', () => {
  const memoir = readFileSync('tests/fixtures/memoir.md', 'utf8');
  for (const name of ['Aunt Rosa', 'Rosa', 'Uncle Teo', 'Teo']) expect(memoir).toContain(name);
});
