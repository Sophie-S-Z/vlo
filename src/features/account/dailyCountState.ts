import { guessDeviceName } from '@/features/sync/deviceName';
import { toBase64Url } from '@/lib/crypto';

/*
 * The on and off state of the daily count and the install id (Phase 18, decision A3). It stays in this
 * browser's localStorage. Settings reads it, so this module holds no network code.
 */

const KEY = 'vlo:daily-count';

export interface DailyCountState {
  off: boolean;
  /** The random id of this browser, made at the first count. */
  install?: string;
  /** The UTC day of the last count that went through, as "YYYY-MM-DD". */
  day?: string;
}

export function readDailyCount(): DailyCountState {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<DailyCountState> | null;
    return {
      off: value?.off === true,
      ...(typeof value?.install === 'string' ? { install: value.install } : {}),
      ...(typeof value?.day === 'string' ? { day: value.day } : {}),
    };
  } catch {
    return { off: false };
  }
}

export function writeDailyCount(state: DailyCountState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // With no storage, the next visit counts again. The server keeps one row for each install and day.
  }
}

/** Turns the daily count on or off. Off forgets the install id, so a later count is a new install. */
export function setDailyCountOn(on: boolean): void {
  writeDailyCount(on ? { ...readDailyCount(), off: false } : { off: true });
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
