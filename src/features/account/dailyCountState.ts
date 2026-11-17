import { guessDeviceName } from '@/features/sync/deviceName';
import { toBase64Url } from '@/lib/crypto';

/*
 * The state of the daily count and the install id (Phase 18, decision A3). It stays in this browser's
 * localStorage. The count is always on. A value of `off` from an older version has no effect.
 */

const KEY = 'vlo:daily-count';

export interface DailyCountState {
  /** The random id of this browser, made at the first count. */
  install?: string;
  /** The local day of the last count that went through, as "YYYY-MM-DD". */
  day?: string;
  /** What the projects looked like at that count, so an unchanged device sends nothing new. */
  seen?: string;
  /** The time of that count, in ms. */
  at?: number;
}

export function readDailyCount(): DailyCountState {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<DailyCountState> | null;
    return {
      ...(typeof value?.install === 'string' ? { install: value.install } : {}),
      ...(typeof value?.day === 'string' ? { day: value.day } : {}),
      ...(typeof value?.seen === 'string' ? { seen: value.seen } : {}),
      ...(typeof value?.at === 'number' ? { at: value.at } : {}),
    };
  } catch {
    return {};
  }
}

export function writeDailyCount(state: DailyCountState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // With no storage, the next visit counts again. The server keeps one row for each install and day.
  }
}

/** The install id of this browser: 16 random bytes in base64url, as the relay ids. */
export function installId(): string {
  const state = readDailyCount();
  if (state.install) return state.install;
  const install = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  writeDailyCount({ ...state, install });
  return install;
}

export type DeviceKind = 'phone' | 'tablet' | 'computer';

export function deviceKind(): DeviceKind {
  const name = guessDeviceName();
  return name === 'Phone' ? 'phone' : name === 'Tablet' ? 'tablet' : 'computer';
}
