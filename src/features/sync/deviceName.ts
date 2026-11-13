/** A name for a new device from the kind of browser, which the writer can change. */
export function guessDeviceName(agent = navigator.userAgent): string {
  if (/iPad|Tablet/i.test(agent)) return 'Tablet';
  if (/iPhone|Android|Mobile/i.test(agent)) return 'Phone';
  return 'Computer';
}
