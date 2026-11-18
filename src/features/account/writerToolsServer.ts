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

/** Brings the newer copy to each side, then sends each change. Returns a function that stops it. */
export function followWriterTools(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  /** The change time of the copy that the server has, so a copy from the server never goes back up. */
  let serverAt = 0;

  /** Takes the server's copy when it is newer than this device's. */
  const pull = async () => {
    const [row] = await accountRpc<Row[]>('writer_settings_get');
    if (stopped) return;
    serverAt = Math.max(serverAt, row?.changed_at ?? 0);
    if (row) takeWriterTools({ ...(row.settings as object), updatedAt: row.changed_at });
  };
  /** Sends this device's copy. The server refuses it when another device changed later; then that copy comes here. */
  const push = async () => {
    const { toolbar, keys, updatedAt } = getWriterTools();
    if (stopped || updatedAt <= serverAt) return;
    const saved = await accountRpc<boolean>('writer_settings_put', {
      p_settings: { toolbar, keys },
      p_changed_at: updatedAt,
    });
    if (saved) serverAt = Math.max(serverAt, updatedAt);
    else await pull();
  };

  void pull()
    .then(push)
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
