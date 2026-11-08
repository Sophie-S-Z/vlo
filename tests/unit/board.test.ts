import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  addCard,
  addThread,
  cardsFromScenes,
  deleteCard,
  deleteThread,
  linkCards,
  moveCard,
  restoreCard,
  updateCard,
} from '@/features/board/board';
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  centerOn,
  fitAll,
  glideAt,
  glideDone,
  glideEnd,
  snap,
  TAU,
  threadPath,
  toBoard,
  zoomAt,
} from '@/features/board/geometry';
import { addItem } from '@/features/binder/items';
import { createProject } from '@/features/library/projects';
import { db } from '@/lib/db';

/* Story Board (spec 8.1, plan Task C2): geometry and data. */

describe('Board geometry', () => {
  test('snaps to the 8 px grid', () => {
    expect(snap(3)).toBe(0);
    expect(snap(4)).toBe(8);
    expect(snap(-13)).toBe(-16);
    expect(snap(100)).toBe(104);
  });

  test('zoom keeps the board point under the pointer in place, within 10 % and 400 %', () => {
    const view = { x: 40, y: -20, scale: 1 };
    const pointer = { x: 300, y: 200 };
    const before = toBoard(view, pointer);
    const zoomed = zoomAt(view, 1.5, pointer);
    expect(zoomed.scale).toBe(1.5);
    const after = toBoard(zoomed, pointer);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(zoomAt(view, 100, pointer).scale).toBe(4);
    expect(zoomAt(view, 0.001, pointer).scale).toBe(0.1);
  });

  test('fit all shows every card inside the viewport, never above 100 %', () => {
    const cards = [
      { x: -400, y: 0 },
      { x: 1200, y: 800 },
    ];
    const viewport = { width: 800, height: 600 };
    const view = fitAll(cards, viewport);
    expect(view.scale).toBeLessThan(1);
    for (const c of cards) {
      const left = view.x + c.x * view.scale;
      const right = view.x + (c.x + CARD_WIDTH) * view.scale;
      const top = view.y + c.y * view.scale;
      const bottom = view.y + (c.y + CARD_HEIGHT) * view.scale;
      expect(left).toBeGreaterThanOrEqual(0);
      expect(right).toBeLessThanOrEqual(viewport.width);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(bottom).toBeLessThanOrEqual(viewport.height);
    }
    expect(fitAll([{ x: 0, y: 0 }], viewport).scale).toBe(1);
  });

  test('center on puts the middle of a card in the middle of the viewport', () => {
    const view = centerOn({ x: 100, y: 50 }, { width: 400, height: 300 }, 2);
    expect(view.x + (100 + CARD_WIDTH / 2) * 2).toBe(200);
    expect(view.y + (50 + CARD_HEIGHT / 2) * 2).toBe(150);
  });

  test('a thread runs from the edge of one card to the edge of the other', () => {
    const path = threadPath({ x: 0, y: 0 }, { x: 400, y: 0 });
    expect(path).toBe(`M ${String(CARD_WIDTH)} 64 C 304 64, 304 64, 400 64`);
    const down = threadPath({ x: 0, y: 0 }, { x: 0, y: 400 });
    expect(down.startsWith(`M ${String(CARD_WIDTH / 2)} ${String(CARD_HEIGHT)}`)).toBe(true);
  });

  test('a throw glides toward a grid point and slows down; a slow release only snaps', () => {
    const from = { x: 10, y: 10 };
    const end = glideEnd(from, { x: 1, y: 0 });
    expect(end).toEqual({ x: snap(10 + TAU), y: 8 });
    expect(glideEnd(from, { x: 0.05, y: 0 })).toEqual({ x: 8, y: 8 });
    const early = glideAt(from, end, 50);
    const later = glideAt(from, end, 400);
    expect(early.x).toBeGreaterThan(from.x);
    expect(later.x).toBeGreaterThan(early.x);
    // Each step moves less than the one before.
    expect(later.x - early.x).toBeLessThan((early.x - from.x) * 7);
    expect(glideDone(from, end, 50)).toBe(false);
    expect(glideDone(from, end, 3000)).toBe(true);
  });
});

describe('Board data', () => {
  beforeEach(async () => {
    await db.open();
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persist: () => Promise.resolve(true) },
    });
  });
  afterEach(async () => {
    Reflect.deleteProperty(navigator, 'storage');
    await db.delete();
  });

  async function novel() {
    const { project } = await createProject({ title: 'Salt Year', templates: ['novel'] });
    const first = (await db.items.where('projectId').equals(project.id).toArray()).find(
      (i) => i.kind === 'scene',
    );
    if (!first) throw new Error('No scene.');
    const second = await addItem(project.id, first.parentId, 'scene', 'Scene 2');
    await db.items.update(second.id, { synopsis: 'Mira pays the debt.' });
    return { project, scenes: [first, { ...second, synopsis: 'Mira pays the debt.' }] };
  }

  test('a card snaps to the grid when added and moved, and marks the project as changed', async () => {
    const { project } = await novel();
    const card = await addCard(project.id, { title: ' Storm ', x: 13, y: 21 });
    expect(card).toMatchObject({ title: 'Storm', x: 16, y: 24, color: 'paper' });
    await db.projects.update(project.id, { updatedAt: 1 });
    await moveCard(card.id, 99, -3);
    expect(await db.cards.get(card.id)).toMatchObject({ x: 96, y: 0 });
    expect((await db.projects.get(project.id))?.updatedAt).toBeGreaterThan(1);
    await expect(addCard(project.id, { title: '  ', x: 0, y: 0 })).rejects.toThrow();
  });

  test('a card edit can clear its note and its link', async () => {
    const { project, scenes } = await novel();
    const card = await addCard(project.id, {
      title: 'Storm',
      x: 0,
      y: 0,
      note: 'Rain',
      itemId: scenes[0]?.id ?? '',
    });
    await updateCard(card.id, { note: ' ', itemId: null, color: 'sky' });
    const row = await db.cards.get(card.id);
    expect(row?.note).toBeUndefined();
    expect(row?.itemId).toBeUndefined();
    expect(row?.color).toBe('sky');
  });

  test('cards from scenes makes one card for each scene without one, below the other cards', async () => {
    const { project, scenes } = await novel();
    await addCard(project.id, { title: 'Idea', x: 0, y: 400 });
    expect(await cardsFromScenes(project.id, scenes)).toBe(2);
    const cards = await db.cards.where('projectId').equals(project.id).toArray();
    const made = cards.filter((c) => c.itemId !== undefined);
    expect(made.map((c) => c.title).sort()).toEqual(['Scene 1', 'Scene 2']);
    expect(made.find((c) => c.title === 'Scene 2')?.note).toBe('Mira pays the debt.');
    expect(made.every((c) => c.y > 400 && c.x % 8 === 0 && c.y % 8 === 0)).toBe(true);
    expect(await cardsFromScenes(project.id, scenes)).toBe(0);
  });

  test('two cards have at most one link, and a second link changes its thread', async () => {
    const { project } = await novel();
    const a = await addCard(project.id, { title: 'A', x: 0, y: 0 });
    const b = await addCard(project.id, { title: 'B', x: 300, y: 0 });
    const debt = await addThread(project.id, "Mira's debt", 'rose');
    const light = await addThread(project.id, 'The lighthouse', 'sky');
    expect(light.order > debt.order).toBe(true);
    await linkCards(project.id, a.id, b.id, debt.id);
    await linkCards(project.id, b.id, a.id, light.id);
    const links = await db.cardLinks.where('projectId').equals(project.id).toArray();
    expect(links).toHaveLength(1);
    expect(links[0]?.threadId).toBe(light.id);
    await expect(linkCards(project.id, a.id, a.id)).rejects.toThrow();
  });

  test('deleting a thread keeps its links as plain links', async () => {
    const { project } = await novel();
    const a = await addCard(project.id, { title: 'A', x: 0, y: 0 });
    const b = await addCard(project.id, { title: 'B', x: 300, y: 0 });
    const thread = await addThread(project.id, 'The lighthouse', 'sky');
    await linkCards(project.id, a.id, b.id, thread.id);
    await deleteThread(thread.id);
    const links = await db.cardLinks.toArray();
    expect(links).toHaveLength(1);
    expect(links[0]?.threadId).toBeUndefined();
  });

  test('undo puts back a deleted card and its links, without a link to a card deleted since', async () => {
    const { project } = await novel();
    const a = await addCard(project.id, { title: 'A', x: 0, y: 0 });
    const b = await addCard(project.id, { title: 'B', x: 300, y: 0 });
    const c = await addCard(project.id, { title: 'C', x: 600, y: 0 });
    const thread = await addThread(project.id, 'The lighthouse', 'sky');
    await linkCards(project.id, a.id, b.id, thread.id);
    await linkCards(project.id, a.id, c.id);
    const deleted = await deleteCard(a.id);
    expect(await db.cardLinks.count()).toBe(0);
    await deleteCard(c.id);
    await deleteThread(thread.id);
    if (!deleted) throw new Error('No card deleted.');
    await restoreCard(deleted);
    expect(await db.cards.get(a.id)).toBeDefined();
    const links = await db.cardLinks.toArray();
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ fromCardId: a.id, toCardId: b.id });
    expect(links[0]?.threadId).toBeUndefined();
  });
});
