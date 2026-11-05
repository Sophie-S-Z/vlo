import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { addCard, addThread, linkCards, moveCardToThread, moveThread } from '@/features/board/board';
import { NONE, plotGrid } from '@/features/board/plotGrid';
import { addItem, moveItem } from '@/features/binder/items';
import { createProject } from '@/features/library/projects';
import { db, type Card } from '@/lib/db';
import { orderAfterLast, sortByOrder } from '@/lib/order';

/* The Plot Grid (spec 8.1, plan Task C3) and the thread order it follows. */

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

/**
 * The novel fixture of plan Task C3: 3 chapters, 2 threads and 6 cards. Chapter 1 has scenes A and B,
 * chapter 2 has scene C, and chapter 3 has scene D inside a part.
 */
async function fixture() {
  const { project } = await createProject({ title: 'Salt Year', template: 'novel' });
  const starter = await db.items.where('projectId').equals(project.id).toArray();
  const chapter1 = starter.find((i) => i.kind === 'chapter');
  const sceneA = starter.find((i) => i.kind === 'scene');
  if (!chapter1 || !sceneA) throw new Error('The novel starter has no chapter or scene.');
  const sceneB = await addItem(project.id, chapter1.id, 'scene', 'Scene B');
  const chapter2 = await addItem(project.id, null, 'chapter', 'Chapter 2');
  const sceneC = await addItem(project.id, chapter2.id, 'scene', 'Scene C');
  const part = await addItem(project.id, null, 'part', 'Part Two');
  const chapter3 = await addItem(project.id, part.id, 'chapter', 'Chapter 3');
  const sceneD = await addItem(project.id, chapter3.id, 'scene', 'Scene D');

  const debt = await addThread(project.id, 'The debt', 'amber');
  const secret = await addThread(project.id, 'The secret', 'sky');

  const card = (title: string, itemId?: string) =>
    addCard(project.id, { title, x: 0, y: 0, ...(itemId ? { itemId } : {}) });
  const a = await card('Arrival', sceneA.id);
  const b = await card('Ledger', sceneB.id);
  const c = await card('Letter', sceneC.id);
  const d = await card('Harbour', sceneD.id);
  const loose = await card('Loose idea');
  const bare = await card('No thread yet', sceneC.id);

  // Arrival and Ledger share the debt. Ledger and Letter share the secret, so Ledger is on both.
  await linkCards(project.id, a.id, b.id, debt.id);
  await linkCards(project.id, b.id, c.id, secret.id);
  // Harbour links to the loose card on the debt. The plain link from Letter adds no thread.
  await linkCards(project.id, d.id, loose.id, debt.id);
  await linkCards(project.id, c.id, bare.id);

  return { project, chapter1, chapter2, chapter3, debt, secret, cards: { a, b, c, d, loose, bare } };
}

async function rowsOf(projectId: string) {
  const [items, cards, links, threads] = await Promise.all([
    db.items.where('projectId').equals(projectId).toArray(),
    db.cards.where('projectId').equals(projectId).toArray(),
    db.cardLinks.where('projectId').equals(projectId).toArray(),
    db.threads.where('projectId').equals(projectId).toArray(),
  ]);
  return { items: sortByOrder(items), cards, links, threads: sortByOrder(threads) };
}

const titles = (cards: Card[] | undefined) => (cards ?? []).map((c) => c.title).sort();

describe('Plot Grid', () => {
  test('the fixture gives the right rows, columns and cells', async () => {
    const f = await fixture();
    const rows = await rowsOf(f.project.id);
    const grid = plotGrid(rows.items, rows.cards, rows.links, rows.threads);

    expect(grid.rows.map((r) => r.title)).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3', 'No chapter']);
    expect(grid.columns.map((c) => c.title)).toEqual(['The debt', 'The secret', 'No thread']);
    const cell = (row: string, column: string) => titles(grid.cells.get(row)?.get(column));

    expect(cell(f.chapter1.id, f.debt.id)).toEqual(['Arrival', 'Ledger']);
    expect(cell(f.chapter1.id, f.secret.id)).toEqual(['Ledger']);
    expect(cell(f.chapter2.id, f.secret.id)).toEqual(['Letter']);
    expect(cell(f.chapter2.id, NONE)).toEqual(['No thread yet']);
    // A scene inside a part still sits in its chapter.
    expect(cell(f.chapter3.id, f.debt.id)).toEqual(['Harbour']);
    expect(cell(NONE, f.debt.id)).toEqual(['Loose idea']);

    // Every card shows at least once, and only Ledger shows twice.
    const shown = [...grid.cells.values()].flatMap((byColumn) => [...byColumn.values()].flat());
    expect(new Set(shown.map((c) => c.id)).size).toBe(6);
    expect(shown.filter((c) => c.title === 'Ledger')).toHaveLength(2);
  });

  test('moving a scene to another chapter moves its card to that row', async () => {
    const f = await fixture();
    const before = await rowsOf(f.project.id);
    const siblings = before.items.filter((i) => i.parentId === f.chapter2.id).map((i) => i.order);
    const sceneA = f.cards.a.itemId ?? '';
    await moveItem(sceneA, f.chapter2.id, orderAfterLast(siblings));

    const after = await rowsOf(f.project.id);
    const grid = plotGrid(after.items, after.cards, after.links, after.threads);
    expect(titles(grid.cells.get(f.chapter1.id)?.get(f.debt.id))).toEqual(['Ledger']);
    expect(titles(grid.cells.get(f.chapter2.id)?.get(f.debt.id))).toEqual(['Arrival']);
  });

  test('a link on a new thread moves a card out of "No thread"', async () => {
    const f = await fixture();
    await linkCards(f.project.id, f.cards.c.id, f.cards.bare.id, f.secret.id);
    const rows = await rowsOf(f.project.id);
    const grid = plotGrid(rows.items, rows.cards, rows.links, rows.threads);
    expect(grid.columns.map((c) => c.id)).not.toContain(NONE);
    expect(titles(grid.cells.get(f.chapter2.id)?.get(f.secret.id))).toEqual(['Letter', 'No thread yet']);
  });

  test('a board with no threads has one "No thread" column', async () => {
    const { project } = await createProject({ title: 'Empty', template: 'novel' });
    const rows = await rowsOf(project.id);
    const grid = plotGrid(rows.items, rows.cards, rows.links, rows.threads);
    expect(grid.columns).toEqual([{ id: NONE, title: 'No thread', color: null }]);
    expect(grid.rows.map((r) => r.title)).toEqual(['Chapter 1']);
  });

  test('a cell move changes the thread: the links on the old thread move, with their other cards', async () => {
    const f = await fixture();
    // Harbour sits in "The debt" through its link to the loose card.
    const changed = await moveCardToThread(f.cards.d.id, f.debt.id, f.secret.id);
    expect(changed).toBe(1);
    const rows = await rowsOf(f.project.id);
    const grid = plotGrid(rows.items, rows.cards, rows.links, rows.threads);
    expect(titles(grid.cells.get(f.chapter3.id)?.get(f.debt.id))).toEqual([]);
    expect(titles(grid.cells.get(f.chapter3.id)?.get(f.secret.id))).toEqual(['Harbour']);
    expect(titles(grid.cells.get(NONE)?.get(f.secret.id))).toEqual(['Loose idea']);
    // Ledger keeps its other thread.
    expect(titles(grid.cells.get(f.chapter1.id)?.get(f.secret.id))).toEqual(['Ledger']);
  });

  test('a card from "No thread" moves its plain links, or links to the card the writer picks', async () => {
    const f = await fixture();
    // "No thread yet" has one plain link, to Letter.
    expect(await moveCardToThread(f.cards.bare.id, null, f.debt.id)).toBe(1);
    let rows = await rowsOf(f.project.id);
    let grid = plotGrid(rows.items, rows.cards, rows.links, rows.threads);
    expect(titles(grid.cells.get(f.chapter2.id)?.get(f.debt.id))).toEqual(['Letter', 'No thread yet']);

    // A card with no link at all needs a partner.
    const alone = await addCard(f.project.id, { title: 'Alone', x: 0, y: 0 });
    await expect(moveCardToThread(alone.id, null, f.secret.id)).rejects.toThrow('Pick a card');
    expect(await moveCardToThread(alone.id, null, f.secret.id, f.cards.c.id)).toBe(1);
    rows = await rowsOf(f.project.id);
    grid = plotGrid(rows.items, rows.cards, rows.links, rows.threads);
    expect(titles(grid.cells.get(NONE)?.get(f.secret.id))).toEqual(['Alone']);
  });

  test('the columns follow the thread order', async () => {
    const f = await fixture();
    await moveThread(f.secret.id, -1);
    const rows = await rowsOf(f.project.id);
    expect(rows.threads.map((t) => t.name)).toEqual(['The secret', 'The debt']);
    const grid = plotGrid(rows.items, rows.cards, rows.links, rows.threads);
    expect(grid.columns.map((c) => c.title)).toEqual(['The secret', 'The debt', 'No thread']);
  });
});

describe('Thread order', () => {
  test('a thread moves one place at a time, and the ends stay put', async () => {
    const { project } = await createProject({ title: 'Salt Year', template: 'novel' });
    const one = await addThread(project.id, 'One', 'amber');
    await addThread(project.id, 'Two', 'sage');
    const three = await addThread(project.id, 'Three', 'sky');
    const names = async () =>
      sortByOrder(await db.threads.where('projectId').equals(project.id).toArray()).map((t) => t.name);

    await moveThread(one.id, 1);
    expect(await names()).toEqual(['Two', 'One', 'Three']);
    await moveThread(one.id, 1);
    expect(await names()).toEqual(['Two', 'Three', 'One']);
    await moveThread(one.id, 1);
    expect(await names()).toEqual(['Two', 'Three', 'One']);
    await moveThread(three.id, -1);
    await moveThread(three.id, -1);
    expect(await names()).toEqual(['Three', 'Two', 'One']);
    await moveThread(three.id, -1);
    expect(await names()).toEqual(['Three', 'Two', 'One']);
  });
});
