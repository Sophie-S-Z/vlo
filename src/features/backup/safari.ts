/*
 * Safari can clear the data of a website after 7 days without a visit (spec section 2). A web app on the
 * Dock or the Home Screen keeps its data, so Vlo shows Safari users the steps to install it.
 */

export type SafariDevice = 'mac' | 'ios';

interface BrowserInfo {
  userAgent: string;
  maxTouchPoints: number;
  /** True when Vlo runs as an installed web app. */
  installed: boolean;
}

/** Safari on a Mac, iPhone or iPad, outside an installed web app. Other browsers give null. */
export function safariDevice({ userAgent, maxTouchPoints, installed }: BrowserInfo): SafariDevice | null {
  if (installed) return null;
  if (!userAgent.includes('Safari/') || !userAgent.includes('Version/')) return null;
  // Chrome, Edge, Firefox and Opera on Apple devices name Safari in their user agents too.
  if (/Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg\/|OPR|OPiOS|Firefox/.test(userAgent)) return null;
  // iPadOS asks for the desktop site, so an iPad says "Macintosh" and has a touch screen.
  if (/iPhone|iPad|iPod/.test(userAgent) || (userAgent.includes('Macintosh') && maxTouchPoints > 1))
    return 'ios';
  return userAgent.includes('Macintosh') ? 'mac' : null;
}

/** The Safari device of this browser, or null. */
export function currentSafariDevice(): SafariDevice | null {
  if (typeof navigator === 'undefined') return null;
  const installed =
    (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) ||
    (navigator as { standalone?: boolean }).standalone === true;
  return safariDevice({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    installed,
  });
}

/** The app-wide flag that the writer closed the install steps in the Library. */
export const SAFARI_STEPS_CLOSED = 'safariInstallClosed';
