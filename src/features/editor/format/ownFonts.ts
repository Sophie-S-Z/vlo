import { safeStorage } from '@/app/preferences';
import { cleanFontName } from './fonts';

/*
 * The writer's own installed fonts (plan decision 7). Chrome and Edge list them through Local Font Access
 * after the writer allows it. Other browsers take a typed name. The names the writer used last stay on
 * this device only.
 */

const KEY = 'vlo:own-fonts';
const MAX_RECENT = 8;

export function recentOwnFonts(): string[] {
  try {
    const raw: unknown = JSON.parse(safeStorage()?.getItem(KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    const names = raw.filter((v): v is string => typeof v === 'string').map(cleanFontName);
    return [...new Set(names.filter((n) => n !== ''))].slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

/** Puts an installed font first in the recent list and returns the new list. */
export function rememberOwnFont(name: string): string[] {
  const clean = cleanFontName(name);
  if (clean === '') return recentOwnFonts();
  const lower = clean.toLowerCase();
  const next = [clean, ...recentOwnFonts().filter((n) => n.toLowerCase() !== lower)].slice(0, MAX_RECENT);
  try {
    safeStorage()?.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private windows can refuse storage. The list then lasts until the page closes.
  }
  return next;
}

interface LocalFontData {
  family: string;
  style?: string;
  blob?: () => Promise<Blob>;
}

type QueryLocalFonts = () => Promise<LocalFontData[]>;

function localFontQuery(): QueryLocalFonts | null {
  const query = (window as unknown as { queryLocalFonts?: unknown }).queryLocalFonts;
  return typeof query === 'function' ? (query as QueryLocalFonts).bind(window) : null;
}

/** True when the browser can list installed fonts (Chrome and Edge on a computer). */
export function canListFonts(): boolean {
  return typeof window !== 'undefined' && localFontQuery() !== null;
}

export type FontListResult = { fonts: string[] } | { error: 'denied' | 'unsupported' };

/** Asks the browser for the installed font families, sorted by name. The browser asks the writer first. */
export async function listInstalledFonts(): Promise<FontListResult> {
  const query = localFontQuery();
  if (!query) return { error: 'unsupported' };
  try {
    const all = await query();
    const families = new Set<string>();
    for (const font of all) {
      const name = cleanFontName(font.family);
      if (name !== '') families.add(name);
    }
    return { fonts: [...families].sort((a, b) => a.localeCompare(b)) };
  } catch {
    return { error: 'denied' };
  }
}

/**
 * The file of an installed font's upright style, for a PDF or EPUB export. Vlo reads it only when the writer
 * already let Vlo see installed fonts, so an export never asks. Null when Vlo cannot read it.
 */
export async function readInstalledFont(name: string): Promise<Uint8Array | null> {
  const query = localFontQuery();
  if (!query) return null;
  try {
    const status = await navigator.permissions.query({ name: 'local-fonts' as PermissionName });
    if (status.state !== 'granted') return null;
    const clean = cleanFontName(name).toLowerCase();
    const faces = (await query()).filter((font) => cleanFontName(font.family).toLowerCase() === clean);
    const upright =
      faces.find((font) => /^(regular|normal|book|roman|medium)$/i.test(font.style ?? '')) ?? faces[0];
    if (!upright?.blob) return null;
    return new Uint8Array(await (await upright.blob()).arrayBuffer());
  } catch {
    return null;
  }
}

const PROBE = 'mmmmmmmmmmlliI10WQ@#&';
const BASES = ['monospace', 'serif', 'sans-serif'] as const;

/**
 * True when the font seems to be installed, false when the browser draws the fallback in its place, and
 * null when the browser cannot tell. A drawn probe with the font differs in width from the fallback alone.
 */
export function fontSeemsInstalled(name: string): boolean | null {
  const clean = cleanFontName(name);
  if (clean === '') return false;
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = document.createElement('canvas').getContext('2d');
  } catch {
    return null;
  }
  if (!context) return null;
  const ctx = context;
  const width = (family: string) => {
    ctx.font = `72px ${family}`;
    return ctx.measureText(PROBE).width;
  };
  return BASES.some((base) => width(`'${clean}', ${base}`) !== width(base));
}
