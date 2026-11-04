/** Saves bytes to the device's downloads through a link with a download name. */
export function downloadBytes(name: string, type: string, bytes: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // The browser reads the file after the click returns, so the address stays valid a little longer.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}
