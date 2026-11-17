/** True when Vlo runs as an installed app: from the home screen or the dock, not in a browser tab. */
export function installedApp(): boolean {
  try {
    return (
      matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}
