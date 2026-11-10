/*
 * The paragraphs of two versions side by side (F55, plan Task K2). An LCS on whole paragraphs finds the
 * ones that are the same. A run of removed paragraphs next to a run of added ones pairs up as changed
 * paragraphs, so the writer can take one paragraph of the other version in place of its partner.
 */

export type ParagraphRow =
  | { kind: 'same'; a: number; b: number }
  | { kind: 'changed'; a: number; b: number }
  | { kind: 'onlyA'; a: number }
  | { kind: 'onlyB'; b: number };

/** The rows of two lists of paragraphs, in order. `a` is the text now and `b` the other version. */
export function paragraphDiff(a: readonly string[], b: readonly string[]): ParagraphRow[] {
  // The same paragraphs at the start and at the end need no table, so most edits make a small one.
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1;
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  )
    tail += 1;
  const middle = middleRows(a.slice(head, a.length - tail), b.slice(head, b.length - tail)).map(
    (row): ParagraphRow => {
      switch (row.kind) {
        case 'onlyA':
          return { kind: 'onlyA', a: row.a + head };
        case 'onlyB':
          return { kind: 'onlyB', b: row.b + head };
        default:
          return { kind: row.kind, a: row.a + head, b: row.b + head };
      }
    },
  );
  const same = (k: number): ParagraphRow => ({ kind: 'same', a: k, b: k });
  return [
    ...Array.from({ length: head }, (_, k) => same(k)),
    ...middle,
    ...Array.from({ length: tail }, (_, k): ParagraphRow => ({
      kind: 'same',
      a: a.length - tail + k,
      b: b.length - tail + k,
    })),
  ];
}

function middleRows(a: readonly string[], b: readonly string[]): ParagraphRow[] {
  // lcs[i][j] is the length of the longest common run of a[i..] and b[j..].
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    const row = lcs[i] ?? [];
    const below = lcs[i + 1] ?? [];
    for (let j = b.length - 1; j >= 0; j -= 1)
      row[j] = a[i] === b[j] ? (below[j + 1] ?? 0) + 1 : Math.max(below[j] ?? 0, row[j + 1] ?? 0);
  }
  const rows: ParagraphRow[] = [];
  let removed: number[] = [];
  let added: number[] = [];
  const flush = () => {
    const pairs = Math.min(removed.length, added.length);
    for (let k = 0; k < pairs; k += 1) rows.push({ kind: 'changed', a: removed[k] ?? 0, b: added[k] ?? 0 });
    for (const i of removed.slice(pairs)) rows.push({ kind: 'onlyA', a: i });
    for (const j of added.slice(pairs)) rows.push({ kind: 'onlyB', b: j });
    removed = [];
    added = [];
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      flush();
      rows.push({ kind: 'same', a: i, b: j });
      i += 1;
      j += 1;
    } else if (j >= b.length || (i < a.length && (lcs[i + 1]?.[j] ?? 0) >= (lcs[i]?.[j + 1] ?? 0))) {
      removed.push(i);
      i += 1;
    } else {
      added.push(j);
      j += 1;
    }
  }
  flush();
  return rows;
}
