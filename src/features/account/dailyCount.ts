import { rpc, sharingReady } from '@/features/share/rpc';
import { APP_VERSION } from '@/features/usage/usage';
import { clock } from '@/lib/clock';
import { currentSession } from './auth';
import { deviceKind, installId as installIdOf, readDailyCount, writeDailyCount } from './dailyCountState';

export { installId, readDailyCount, setDailyCountOn } from './dailyCountState';

/*
 * The daily count (Phase 18, decision A3). Once a UTC day, a device sends a random install id, the app
 * version, the kind of device and whether Vlo is installed, so the owner knows how many people use Vlo.
 * A signed-in device adds its account. No text, title, name or cookie. Settings has a switch, and the
 * choice stays in this browser.
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

const utcDay = (at: number) => new Date(at).toISOString().slice(0, 10);

/**
 * Sends today's count when the switch is on and no count went today. It never throws: a count that fails
 * goes at the next start.
 */
export async function sendDailyCount(): Promise<boolean> {
  try {
    if (!sharingReady()) return false;
    const state = readDailyCount();
    const today = utcDay(clock.now());
    if (state.off || state.day === today) return false;
    const install = installIdOf();
    const session = await currentSession().catch(() => null);
    await rpc(
      'daily_count',
      { p_install: install, p_version: APP_VERSION, p_device: deviceKind(), p_installed: installedApp() },
      'ping',
      session?.accessToken,
    );
    writeDailyCount({ ...readDailyCount(), install, day: today });
    return true;
  } catch {
    return false;
  }
}
