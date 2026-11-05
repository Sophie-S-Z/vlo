import { clock } from '@/lib/clock';
import { db, type Card, type CardLink, type Item, type Thread } from '@/lib/db';
import { newId } from '@/lib/ids';
import { orderAfterLast, orderBetween, sortByOrder } from '@/lib/order';
import { CARD_HEIGHT, gridPlaces, snap } from './geometry';

/*
 * Story Board data (spec 8.1, plan Task C2): cards, threads and the links between cards. Each change also
 * marks the project as changed, so the Library order, the backup reminder and folder save see it.
 */

/** The colors a card or a thread can have. Each is a hue that the theme mixes with its own colors. */
export const BOARD_COLORS = [
  { id: 'paper', label: 'Paper', hue: null },
  { id: 'amber', label: 'Amber', hue: '#d9a441' },
  { id: 'sage', label: 'Sage', hue: '#6f9a6a' },
  { id: 'sky', label: 'Sky', hue: '#4f86c6' },
  { id: 'rose', label: 'Rose', hue: '#c75f76' },
  { id: 'lilac', label: 'Lilac', hue: '#8f6fc4' },
] as const;
export type BoardColor = (typeof BOARD_COLORS)[number]['id'];

const hueOf = (color: string) => BOARD_COLORS.find((c) => c.id === color)?.hue ?? null;

/** A card's background: the theme's surface with a tint of the card's hue, so text keeps its contrast. */
export function cardBackground(color: string): string {
  const hue = hueOf(color);
  return hue === null ? 'var(--surface)' : `color-mix(in oklab, var(--surface) 80%, ${hue})`;
}

/** A thread's stroke: the hue mixed toward the text color, so the line stands out on every theme. */
export function threadStroke(color: string): string {
  const hue = hueOf(color) ?? '#8a8070';
  return `color-mix(in oklab, ${hue} 70%, var(--text))`;
}

export function colorLabel(color: string): string {
  return BOARD_COLORS.find((c) => c.id === color)?.label ?? 'Paper';
}

async function touch(projectId: string): Promise<void> {
  await db.projects.update(projectId, { updatedAt: clock.now() });
}

function cleanTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed === '') throw new Error('A card needs a title.');
  return trimmed;
}

export async function addCard(
  projectId: string,
  card: { title: string; x: number; y: number; note?: string; itemId?: string; color?: string },
): Promise<Card> {
  const row: Card = {
    id: newId(),
    projectId,
    title: cleanTitle(card.title),
    x: snap(card.x),
    y: snap(card.y),
    color: card.color ?? 'paper',
    ...(card.note ? { note: card.note } : {}),
    ...(card.itemId ? { itemId: card.itemId } : {}),
  };
  await db.transaction('rw', db.cards, db.projects, async () => {
    await db.cards.add(row);
    await touch(projectId);
  });
  return row;
}

export async function updateCard(
  id: string,
  patch: { title?: string; note?: string; color?: string; itemId?: string | null },
): Promise<void> {
  await db.transaction('rw', db.cards, db.projects, async () => {
    const card = await db.cards.get(id);
    if (!card) return;
    await db.cards
      .where('id')
      .equals(id)
      .modify((row) => {
        if (patch.title !== undefined) row.title = cleanTitle(patch.title);
        if (patch.note !== undefined) {
          if (patch.note.trim() === '') delete row.note;
          else row.note = patch.note;
        }
        if (patch.color !== undefined) row.color = patch.color;
        if (patch.itemId === null) delete row.itemId;
        else if (patch.itemId !== undefined) row.itemId = patch.itemId;
      });
    await touch(card.projectId);
  });
}

/** Moves a card. The position snaps to the 8 px grid. */
export async function moveCard(id: string, x: number, y: number): Promise<void> {
  await db.transaction('rw', db.cards, db.projects, async () => {
    const card = await db.cards.get(id);
    if (!card) return;
    await db.cards.update(id, { x: snap(x), y: snap(y) });
    await touch(card.projectId);
  });
}

/**
 * Moves a card by a step from where the store has it, and returns the new place. Key presses that come
 * faster than the screen updates each count, because each reads the stored place.
 */
export async function nudgeCard(
  id: string,
  dx: number,
  dy: number,
): Promise<{ x: number; y: number } | null> {
  return db.transaction('rw', db.cards, db.projects, async () => {
    const card = await db.cards.get(id);
    if (!card) return null;
    const at = { x: snap(card.x + dx), y: snap(card.y + dy) };
    await db.cards.update(id, at);
    await touch(card.projectId);
    return at;
  });
}

/** What a delete removed, so Undo can put it back. */
export interface DeletedCard {
  card: Card;
  links: CardLink[];
}

export async function deleteCard(id: string): Promise<DeletedCard | null> {
  return db.transaction('rw', db.cards, db.cardLinks, db.projects, async () => {
    const card = await db.cards.get(id);
    if (!card) return null;
    const links = [
      ...(await db.cardLinks.where('fromCardId').equals(id).toArray()),
      ...(await db.cardLinks.where('toCardId').equals(id).toArray()),
    ];
    await db.cardLinks.bulkDelete(links.map((l) => l.id));
    await db.cards.delete(id);
    await touch(card.projectId);
    return { card, links };
  });
}

/** Puts back a deleted card and those of its links whose other card and thread are still here. */
export async function restoreCard(deleted: DeletedCard): Promise<void> {
  await db.transaction('rw', db.cards, db.cardLinks, db.threads, db.projects, async () => {
    await db.cards.put(deleted.card);
    const cards = new Set(await db.cards.where('projectId').equals(deleted.card.projectId).primaryKeys());
    const threads = new Set(await db.threads.where('projectId').equals(deleted.card.projectId).primaryKeys());
    const links = deleted.links
      .filter((l) => cards.has(l.fromCardId) && cards.has(l.toCardId))
      .map((l) => {
        if (l.threadId === undefined || threads.has(l.threadId)) return l;
        const rest: CardLink = { ...l };
        delete rest.threadId;
        return rest;
      });
    await db.cardLinks.bulkPut(links);
    await touch(deleted.card.projectId);
  });
}

/**
 * Cards from scenes (plan E1): one card for each scene that has no card, with its title and synopsis, in
 * rows below the lowest card. Returns how many cards it made.
 */
export async function cardsFromScenes(projectId: string, scenesInOrder: readonly Item[]): Promise<number> {
  return db.transaction('rw', db.cards, db.projects, async () => {
    const cards = await db.cards.where('projectId').equals(projectId).toArray();
    const linked = new Set(cards.map((c) => c.itemId));
    const missing = scenesInOrder.filter((s) => !linked.has(s.id));
    if (missing.length === 0) return 0;
    const below = cards.length === 0 ? 0 : Math.max(...cards.map((c) => c.y)) + CARD_HEIGHT + 48;
    const places = gridPlaces(missing.length, below);
    await db.cards.bulkAdd(
      missing.map((scene, i): Card => ({
        id: newId(),
        projectId,
        itemId: scene.id,
        title: scene.title,
        x: places[i]?.x ?? 0,
        y: places[i]?.y ?? below,
        color: 'paper',
        ...(scene.synopsis ? { note: scene.synopsis } : {}),
      })),
    );
    await touch(projectId);
    return missing.length;
  });
}

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') throw new Error('A thread needs a name.');
  return trimmed;
}

export async function addThread(projectId: string, name: string, color: string): Promise<Thread> {
  return db.transaction('rw', db.threads, db.projects, async () => {
    const threads = await db.threads.where('projectId').equals(projectId).toArray();
    const row: Thread = {
      id: newId(),
      projectId,
      name: cleanName(name),
      color,
      order: orderAfterLast(threads.map((t) => t.order)),
    };
    await db.threads.add(row);
    await touch(projectId);
    return row;
  });
}

export async function updateThread(id: string, patch: { name?: string; color?: string }): Promise<void> {
  await db.transaction('rw', db.threads, db.projects, async () => {
    const thread = await db.threads.get(id);
    if (!thread) return;
    await db.threads.update(id, {
      ...(patch.name !== undefined ? { name: cleanName(patch.name) } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
    });
    await touch(thread.projectId);
  });
}

/** Moves a thread one place up (-1) or down (1) in the thread order. The Plot Grid columns follow it. */
export async function moveThread(id: string, step: -1 | 1): Promise<void> {
  await db.transaction('rw', db.threads, db.projects, async () => {
    const thread = await db.threads.get(id);
    if (!thread) return;
    const threads = sortByOrder(await db.threads.where('projectId').equals(thread.projectId).toArray());
    const at = threads.findIndex((t) => t.id === id);
    const target = at + step;
    if (target < 0 || target >= threads.length) return;
    // The new place sits between the neighbor it passes and the thread after that neighbor.
    const before = step === -1 ? (threads[target - 1]?.order ?? null) : (threads[target]?.order ?? null);
    const after = step === -1 ? (threads[target]?.order ?? null) : (threads[target + 1]?.order ?? null);
    await db.threads.update(id, { order: orderBetween(before, after) });
    await touch(thread.projectId);
  });
}

/** Deletes a thread. Its links stay as plain links, so no card loses its place in the story. */
export async function deleteThread(id: string): Promise<void> {
  await db.transaction('rw', db.threads, db.cardLinks, db.projects, async () => {
    const thread = await db.threads.get(id);
    if (!thread) return;
    await db.cardLinks
      .where('projectId')
      .equals(thread.projectId)
      .filter((l) => l.threadId === id)
      .modify((l) => {
        delete l.threadId;
      });
    await db.threads.delete(id);
    await touch(thread.projectId);
  });
}

/**
 * Links two cards, on a thread or with none. A second link between the same two cards changes the thread
 * of the first one, so two cards have at most one link.
 */
export async function linkCards(
  projectId: string,
  fromCardId: string,
  toCardId: string,
  threadId?: string,
): Promise<void> {
  if (fromCardId === toCardId) throw new Error('A card cannot link to itself.');
  await db.transaction('rw', db.cardLinks, db.projects, async () => {
    const existing = await db.cardLinks
      .where('projectId')
      .equals(projectId)
      .filter(
        (l) =>
          (l.fromCardId === fromCardId && l.toCardId === toCardId) ||
          (l.fromCardId === toCardId && l.toCardId === fromCardId),
      )
      .first();
    if (existing) {
      await db.cardLinks
        .where('id')
        .equals(existing.id)
        .modify((l) => {
          if (threadId === undefined) delete l.threadId;
          else l.threadId = threadId;
        });
    } else {
      await db.cardLinks.add({
        id: newId(),
        projectId,
        fromCardId,
        toCardId,
        ...(threadId === undefined ? {} : { threadId }),
      });
    }
    await touch(projectId);
  });
}

/**
 * Moves a card from one thread to another in the Plot Grid (plan Task C3). A card is on a thread through
 * its links, so its links on the old thread (or its plain links, from "No thread") move to the new one.
 * A card with no such link needs `linkTo`: Vlo links it to that card on the new thread. Returns how many
 * links changed or were made.
 */
export async function moveCardToThread(
  cardId: string,
  fromThreadId: string | null,
  toThreadId: string,
  linkTo?: string,
): Promise<number> {
  return db.transaction('rw', db.cards, db.cardLinks, db.threads, db.projects, async () => {
    const card = await db.cards.get(cardId);
    const thread = await db.threads.get(toThreadId);
    if (!card || thread?.projectId !== card.projectId) throw new Error('The card or thread is gone.');
    const mine = [
      ...(await db.cardLinks.where('fromCardId').equals(cardId).toArray()),
      ...(await db.cardLinks.where('toCardId').equals(cardId).toArray()),
    ];
    const moving = mine.filter((l) =>
      fromThreadId === null ? l.threadId === undefined : l.threadId === fromThreadId,
    );
    if (moving.length > 0) {
      await db.cardLinks.bulkUpdate(moving.map((l) => ({ key: l.id, changes: { threadId: toThreadId } })));
      await touch(card.projectId);
      return moving.length;
    }
    if (linkTo === undefined || linkTo === cardId) throw new Error('Pick a card to link to on that thread.');
    const other = await db.cards.get(linkTo);
    if (other?.projectId !== card.projectId) throw new Error('The card to link to is gone.');
    const existing = mine.find((l) => l.fromCardId === linkTo || l.toCardId === linkTo);
    if (existing) await db.cardLinks.update(existing.id, { threadId: toThreadId });
    else
      await db.cardLinks.add({
        id: newId(),
        projectId: card.projectId,
        fromCardId: cardId,
        toCardId: linkTo,
        threadId: toThreadId,
      });
    await touch(card.projectId);
    return 1;
  });
}

export async function unlinkCards(linkId: string): Promise<void> {
  await db.transaction('rw', db.cardLinks, db.projects, async () => {
    const link = await db.cardLinks.get(linkId);
    if (!link) return;
    await db.cardLinks.delete(linkId);
    await touch(link.projectId);
  });
}
