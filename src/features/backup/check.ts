import { generateKeyBetween } from 'fractional-indexing';

/* Checks for the rows of a backup file. Each check names the part of the file that is wrong. */

/** A problem with a backup file, in words for the writer. */
export class BackupError extends Error {
  override name = 'BackupError';
}

/** Ids name files in the zip and databases in the browser, so they hold only safe characters. */
export const ID = /^[A-Za-z0-9_-]{1,64}$/;

export const DAMAGED = 'This backup file is damaged.';

export type Json = Record<string, unknown>;

export function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function fail(message: string): never {
  throw new BackupError(message);
}

export function text(row: Json, key: string, what: string): string {
  const value = row[key];
  if (typeof value !== 'string') fail(`${DAMAGED} ${what} has no ${key}.`);
  return value;
}

export function optionalText(row: Json, key: string, what: string): void {
  if (row[key] !== undefined && typeof row[key] !== 'string') fail(`${DAMAGED} ${what} has a wrong ${key}.`);
}

export function count(row: Json, key: string, what: string): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    fail(`${DAMAGED} ${what} has a wrong ${key}.`);
  return value;
}

export function id(row: Json, key: string, what: string): string {
  const value = text(row, key, what);
  if (!ID.test(value)) fail(`${DAMAGED} ${what} has a wrong ${key}.`);
  return value;
}

export function list(manifest: Json, key: string): Json[] {
  const value = manifest[key];
  if (!Array.isArray(value) || !value.every(isObject)) fail(`${DAMAGED} The ${key} list is missing.`);
  return value;
}

export function checkOrder(order: string, what: string): void {
  try {
    generateKeyBetween(order, null);
  } catch {
    fail(`${DAMAGED} ${what} has a wrong order.`);
  }
}

/** Checks that each row belongs to the project, then checks its fields. */
export function checkRows<T>(
  rows: Json[],
  projectId: string,
  what: string,
  fields: (row: Json) => void,
): T[] {
  for (const row of rows) {
    if (text(row, 'projectId', what) !== projectId) fail(`${DAMAGED} ${what} belongs to another project.`);
    fields(row);
  }
  return rows as unknown as T[];
}
