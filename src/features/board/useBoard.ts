import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Card, type CardLink, type Thread } from '@/lib/db';
import { sortByOrder } from '@/lib/order';
import { CARD_HEIGHT } from './geometry';

/**
 * Cards from top to bottom, then left to right, so the Tab key and the List view follow the board as
 * the writer reads it. Cards within half a card height count as one row.
 */
export function inReadingOrder(cards: readonly Card[]): Card[] {
  const row = (c: Card) => Math.round(c.y / (CARD_HEIGHT / 2));
  return [...cards].sort((a, b) => row(a) - row(b) || a.x - b.x || a.id.localeCompare(b.id));
}

export interface BoardRows {
  cards: Card[];
  threads: Thread[];
  links: CardLink[];
}

/** The cards, threads (in order) and links of a project, live. Undefined while they load. */
export function useBoard(projectId: string): BoardRows | undefined {
  return useLiveQuery(async (): Promise<BoardRows> => {
    const [cards, threads, links] = await Promise.all([
      db.cards.where('projectId').equals(projectId).toArray(),
      db.threads.where('projectId').equals(projectId).toArray(),
      db.cardLinks.where('projectId').equals(projectId).toArray(),
    ]);
    return { cards: inReadingOrder(cards), threads: sortByOrder(threads), links };
  }, [projectId]);
}

/**
 * The view transition name of a card. The board and the Plot Grid share it, so a card moves to its new
 * place when the writer switches views. The scene editor takes it when the writer opens the scene from
 * the card, so the card grows into the scene (F14).
 */
export function cardTransitionName(cardId: string): string {
  return `board-card-${cardId}`;
}

/** The search parameter that tells the project page which card opened the scene. */
export const FROM_CARD = 'card';
