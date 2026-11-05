import { useSyncExternalStore } from 'react';
import { EngineError, type Engine } from './engine/types';
import type { AiRequest, ResultKind } from './reader';

/*
 * The answers in the Assistant panel, by project. They live outside the panel, so a request keeps going
 * while the panel is closed, and the answers are there when it opens again. They stay in memory only:
 * nothing an AI wrote is stored until the writer inserts it or uses it as a synopsis.
 */

export type EntryStatus = 'running' | 'done' | 'stopped' | 'error';

export interface Entry {
  id: string;
  projectId: string;
  label: string;
  result: ResultKind;
  itemId?: string;
  engine: { id: string; label: string; model: string };
  status: EntryStatus;
  /** The answer so far, with real names back in a memoir. */
  text: string;
  error?: string;
  /** What the panel did with the answer, such as "Used as synopsis." */
  used?: string;
  createdAt: number;
}

const entries = new Map<string, Entry[]>();
const controllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();
const EMPTY: Entry[] = [];
let count = 0;

function emit() {
  for (const listener of listeners) listener();
}

function update(id: string, change: Partial<Entry>) {
  for (const [projectId, list] of entries) {
    const at = list.findIndex((e) => e.id === id);
    const current = list[at];
    if (!current) continue;
    const next = [...list];
    next[at] = { ...current, ...change };
    entries.set(projectId, next);
    emit();
    return;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The answers of one project, newest first. */
export function useEntries(projectId: string): readonly Entry[] {
  return useSyncExternalStore(
    subscribe,
    () => entries.get(projectId) ?? EMPTY,
    () => EMPTY,
  );
}

export function getEntries(projectId: string): readonly Entry[] {
  return entries.get(projectId) ?? EMPTY;
}

/**
 * Sends the request and streams the answer into a new entry. `show` turns the text as sent back into the
 * text for the writer's screen, such as aliases back to real names.
 */
export function startEntry(
  projectId: string,
  request: AiRequest,
  engine: Engine,
  show: (text: string) => string,
  label: string,
): string {
  count += 1;
  const id = `answer-${String(count)}`;
  const controller = new AbortController();
  controllers.set(id, controller);
  const entry: Entry = {
    id,
    projectId,
    label,
    result: request.result,
    ...(request.itemId ? { itemId: request.itemId } : {}),
    engine: { id: engine.id, label: engine.label, model: engine.model },
    status: 'running',
    text: '',
    createdAt: Date.now(),
  };
  entries.set(projectId, [entry, ...(entries.get(projectId) ?? [])]);
  emit();
  void (async () => {
    let raw = '';
    try {
      for await (const piece of engine.generate({
        system: request.system,
        messages: request.messages,
        maxTokens: request.maxTokens,
        signal: controller.signal,
      })) {
        raw += piece;
        update(id, { text: show(raw) });
      }
      update(id, { status: controller.signal.aborted ? 'stopped' : 'done', text: show(raw).trim() });
    } catch (problem) {
      update(id, {
        status: 'error',
        text: show(raw).trim(),
        error:
          problem instanceof EngineError || problem instanceof RangeError
            ? problem.message
            : 'The engine stopped with an error. Ask again, or pick another engine.',
      });
    } finally {
      controllers.delete(id);
    }
  })();
  return id;
}

/** Stops one answer at once. The words so far stay. */
export function stopEntry(id: string): void {
  controllers.get(id)?.abort();
}

export function markUsed(id: string, used: string): void {
  update(id, { used });
}

export function removeEntry(id: string): void {
  stopEntry(id);
  for (const [projectId, list] of entries) {
    if (list.some((e) => e.id === id)) {
      entries.set(
        projectId,
        list.filter((e) => e.id !== id),
      );
      emit();
    }
  }
}

/** Stops every answer and forgets them, as when a project goes back to Pen mode. */
export function clearProject(projectId: string): void {
  for (const entry of entries.get(projectId) ?? []) stopEntry(entry.id);
  entries.delete(projectId);
  emit();
}
