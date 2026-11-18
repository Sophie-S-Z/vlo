import { getWriterTools, onWriterTools, takeWriterTools } from '@/features/editor/writerTools';
import { accountRpc } from './auth';

/*
 * The calls of migration 0015 (ADR 0013): the writer's toolbar and keys go with the account. As Vlo opens
 * on a signed-in device, the newer copy wins: the server's copy comes here, or this device's copy goes up.
 * Each later change goes up a moment after the writer makes it.
 */

interface Row {
  settings: unknown;
  changed_at: number;
}

const PUSH_DELAY_MS = 2_000;

/** The change time of the copy that the server has, so a copy from the server never goes back up. */
let serverAt = 0;

async function push(): Promise<void> {
  const { toolbar, keys, updatedAt } = getWriterTools();
  if (updatedAt <= serverAt) return;
  await accountRpc('writer_settings_put', { p_settings: { toolbar, keys }, p_changed_at: updatedAt });
  serverAt = Math.max(serverAt, updatedAt);
}

/** Brings the newer copy to each side, then sends each change. Returns a function that stops it. */
export function followWriterTools(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  serverAt = 0;
  void accountRpc<Row[]>('writer_settings_get')
    .then(([row]) => {
      if (stopped) return;
      serverAt = row?.changed_at ?? 0;
      if (row) takeWriterTools({ ...(row.settings as object), updatedAt: row.changed_at });
      return push();
    })
    .catch(() => undefined);
  const stop = onWriterTools(() => {
    clearTimeout(timer);
    timer = setTimeout(() => void push().catch(() => undefined), PUSH_DELAY_MS);
  });
  return () => {
    stopped = true;
    clearTimeout(timer);
    stop();
  };
}
