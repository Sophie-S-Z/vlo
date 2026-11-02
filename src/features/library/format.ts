const numbers = new Intl.NumberFormat();

export function formatWords(count: number): string {
  return `${numbers.format(count)} ${count === 1 ? 'word' : 'words'}`;
}
