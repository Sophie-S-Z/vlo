import { clock } from '@/lib/clock';
import { db, type Session } from '@/lib/db';
import { newId } from '@/lib/ids';

/** Words and poems in a project now, for working out what a session added. */
export async function projectTotals(projectId: string): Promise<{ words: number; poems: number }> {
  const items = await db.items.where('projectId').equals(projectId).toArray();
  return {
    words: items.reduce((sum, item) => sum + item.wordCount, 0),
    poems: items.filter((item) => item.kind === 'poem').length,
  };
}

/**
 * Starts a writing session, or a sprint when it has a word target. `endedAt` holds the planned end until
 * the writer closes the session.
 */
export async function startSession(projectId: string, minutes: number, target?: number): Promise<Session> {
  const startedAt = clock.now();
  const session: Session = {
    id: newId(),
    projectId,
    startedAt,
    endedAt: startedAt + minutes * 60_000,
    wordsAdded: 0,
    poemsAdded: 0,
    ...(target === undefined ? {} : { target }),
  };
  await db.sessions.add(session);
  return session;
}

/** Closes a session with what it added. Words removed count as zero added, never as a loss. */
export async function endSession(id: string, wordsAdded: number, poemsAdded: number): Promise<void> {
  await db.sessions.update(id, {
    endedAt: clock.now(),
    wordsAdded: Math.max(0, wordsAdded),
    poemsAdded: Math.max(0, poemsAdded),
  });
}

/**
 * Closes a session with what the project gained since `start`, the totals when it started. So a sprint
 * counts only the words of its own time. Returns the words added.
 */
export async function closeSession(
  projectId: string,
  sessionId: string,
  start: { words: number; poems: number },
): Promise<number> {
  const totals = await projectTotals(projectId);
  const words = Math.max(0, totals.words - start.words);
  await endSession(sessionId, words, totals.poems - start.poems);
  return words;
}
