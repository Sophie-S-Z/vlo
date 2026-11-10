import type { DBCore, DBCoreMutateRequest, DBCoreTable, Dexie, Middleware, Table } from 'dexie';
import { clock } from '@/lib/clock';

/*
 * The sync clock (plan Task I6, ADR 0008). A Dexie middleware stamps each put and delete on a synced
 * table with this device's time, in the same transaction, so a sync can tell which row is newer.
 */

/** The tables that sync between a writer's devices (decision R5). Each row has an `id`. */
export const SYNC_TABLES = [
  'projects',
  'items',
  'cards',
  'threads',
  'cardLinks',
  'lifeStages',
  'sequences',
  'people',
  'submissions',
  'codex',
  'research',
  'itemVersions',
  'authorship',
] as const;

export type SyncTable = (typeof SYNC_TABLES)[number];

/** When a row of a synced table last changed, and whether a delete removed it. */
export interface ClockEntry {
  /** `<table>:<id>`. */
  key: string;
  table: SyncTable;
  id: string;
  /** The project of the row. A project's own row has its id. */
  projectId: string;
  /** The time of the change, from the clock of the device that made it. */
  at: number;
  gone?: true;
  /** For a delete, the time of the change that it removed. An edit after that time came from a device whose
   * change the delete never saw, so the edit wins over the delete (ADR 0008). */
  seen?: number;
  /** A change that a sync brought from another device, so this device does not send it as its own. */
  remote?: true;
}

export const CLOCK_TABLE = 'syncClock';

const synced = new Set<string>(SYNC_TABLES);
/** The transactions of a sync's merge, which stamps its rows with the other device's times. */
const remoteWrites = new WeakSet<object>();
let onChange: (() => void) | null = null;

export function clockKey(table: string, id: string): string {
  return `${table}:${id}`;
}

function entry(table: string, row: { id: string; projectId?: string }, at: number): ClockEntry {
  return {
    key: clockKey(table, row.id),
    table: table as SyncTable,
    id: row.id,
    projectId: table === 'projects' ? row.id : (row.projectId ?? ''),
    at,
  };
}

function stamped(table: DBCoreTable, down: DBCore): DBCoreTable {
  return {
    ...table,
    async mutate(req: DBCoreMutateRequest) {
      // A schema upgrade changes every device alike, and runs before the clock table exists.
      if (remoteWrites.has(req.trans) || (req.trans as IDBTransaction).mode === 'versionchange')
        return table.mutate(req);
      // A delete loses its rows, so it reads them first for their project.
      const before =
        req.type === 'delete'
          ? await table.getMany({ trans: req.trans, keys: req.keys })
          : req.type === 'deleteRange'
            ? (
                await table.query({
                  trans: req.trans,
                  values: true,
                  query: { index: table.schema.primaryKey, range: req.range },
                })
              ).result
            : [];
      const clockTable = down.table(CLOCK_TABLE);
      const gone = (before as ({ id: string } | undefined)[]).flatMap((row) => (row ? [row] : []));
      const stamps =
        gone.length > 0
          ? ((await clockTable.getMany({
              trans: req.trans,
              keys: gone.map((row) => clockKey(table.name, row.id)),
            })) as (ClockEntry | undefined)[])
          : [];
      const result = await table.mutate(req);
      const at = clock.now();
      const values: ClockEntry[] =
        req.type === 'add' || req.type === 'put'
          ? req.values.flatMap((row: { id: string }, i) =>
              result.failures[i] ? [] : [entry(table.name, row, at)],
            )
          : gone.map((row, i) => ({ ...entry(table.name, row, at), gone: true, seen: stamps[i]?.at ?? 0 }));
      if (values.length > 0) {
        await clockTable.mutate({ trans: req.trans, type: 'put', values });
        onChange?.();
      }
      return result;
    },
  };
}

/** The middleware that `VloDb` uses. It adds the clock to each read-write transaction on a synced table. */
export const syncClockMiddleware: Middleware<DBCore> = {
  stack: 'dbcore',
  name: 'syncClock',
  create: (down) => ({
    ...down,
    transaction: (stores, mode, options) =>
      down.transaction(
        mode === 'readwrite' && stores.some((s) => synced.has(s)) && !stores.includes(CLOCK_TABLE)
          ? [...stores, CLOCK_TABLE]
          : stores,
        mode,
        options,
      ),
    table: (name) => (synced.has(name) ? stamped(down.table(name), down) : down.table(name)),
  }),
};

/**
 * Runs `fn` in a read-write transaction on `tables` whose writes the middleware does not stamp. A sync's
 * merge writes its clock entries itself, with the times of the device that made each change.
 */
export function remoteTransaction<T>(database: Dexie, tables: Table[], fn: () => Promise<T>): Promise<T> {
  return database.transaction('rw', tables, (tx) => {
    remoteWrites.add(tx.idbtrans);
    return fn();
  });
}

/** Calls `listener` after each change that this device makes to a synced table. One listener at a time. */
export function onLocalChange(listener: (() => void) | null): void {
  onChange = listener;
}
