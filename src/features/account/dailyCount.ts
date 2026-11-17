import { dayKey, wordsOn } from '@/features/progress/streaks';
import { rpc, sharingReady } from '@/features/share/rpc';
import { APP_VERSION } from '@/features/usage/usage';
import { clock } from '@/lib/clock';
import { db } from '@/lib/db';
import { appPlace } from '@/lib/net';
import { currentSession } from './auth';
import { deviceKind, installId as installIdOf, readDailyCount, writeDailyCount } from './dailyCountState';

export { installId, readDailyCount, setDailyCountOn } from './dailyCountState';

/*
 * The daily count (Phase 18, decision A3). Each local day, a device sends a random install id, the app
 * version, the kind of device and whether Vlo is installed, so the owner knows how many people use Vlo.
 * A signed-in device adds its account. The count also holds three numbers for the live owner page: the
 * words added today, the words on the device and its count of projects. The first count of a day adds the
 * rough place that the app's own server reads from the IP address: a country, a region and a city. No
 * text, title, name, IP address or cookie.
 * Settings has a switch, and the choice stays in this browser.
 */

function installedApp(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

/** New words go at most this often. A new day, and a change as Vlo leaves the screen, go at once. */
const COUNT_GAP_MS = 5 * 60_000;

/** The count of projects and the time of the newest change: two index reads, and it moves as a writer types. */
async function projectsSeen(): Promise<string> {
  const [count, newest] = await Promise.all([db.projects.count(), db.projects.orderBy('updatedAt').last()]);
  return `${String(count)}:${String(newest?.updatedAt ?? 0)}`;
}

/** The numbers of the count, held under the server's limits. */
export async function writingNumbers(today: string) {
  const projects = await db.projects.toArray();
  let total = 0;
  await db.items.each((item) => {
    total += item.wordCount;
  });
  const words = projects.reduce((n, p) => n + wordsOn(p.settings.wordsByDay ?? {}, today), 0);
  return {
    words: Math.min(1_000_000, words),
    total: Math.min(100_000_000, total),
    projects: Math.min(100_000, projects.length),
  };
}

/** The counts wait in one line, so two checks at once never send twice. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Sends a count when the switch is on and the day is new, or the projects changed since the last count.
 * `leaving` sends a change at once, as Vlo leaves the screen. It never throws: a count that fails goes
 * at the next try.
 */
export function sendDailyCount(leaving = false): Promise<boolean> {
  const next = queue.then(() => send(leaving));
  queue = next;
  return next;
}

async function send(leaving: boolean): Promise<boolean> {
  try {
    if (!sharingReady()) return false;
    const state = readDailyCount();
    if (state.off) return false;
    const now = clock.now();
    const today = dayKey(now);
    const seen = await projectsSeen();
    const early = !leaving && now - (state.at ?? 0) < COUNT_GAP_MS;
    if (state.day === today && (state.seen === seen || early)) return false;
    const install = installIdOf();
    const [session, numbers, place] = await Promise.all([
      currentSession().catch(() => null),
      writingNumbers(today),
      state.day === today ? null : appPlace(),
    ]);
    await rpc(
      'daily_count',
      {
        p_install: install,
        p_version: APP_VERSION,
        p_device: deviceKind(),
        p_installed: installedApp(),
        p_day: today,
        p_words: numbers.words,
        p_total: numbers.total,
        p_projects: numbers.projects,
        ...(place && { p_country: place.country, p_region: place.region, p_city: place.city }),
      },
      'ping',
      session?.accessToken,
    );
    // A writer who turned the count off while it went keeps it off, with no install id.
    const after = readDailyCount();
    if (!after.off) writeDailyCount({ ...after, install, day: today, seen, at: now });
    return true;
  } catch {
    return false;
  }
}
