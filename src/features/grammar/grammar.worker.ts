/// <reference lib="webworker" />
import type { Dialect, LocalLinter, Lint } from 'harper.js';
import { cleanFixes, OBJECT, utf16Offsets, type GrammarLint } from './lints';

/*
 * The spelling and grammar check off the main thread (Phase 19, Task D1), so typing never waits for it.
 * Harper and its dictionary (about 8 MB gzip) load with the first request only. Nothing leaves the device.
 */

export interface GrammarRequest {
  id: number;
  /** The text of each block, from `blockText`. */
  blocks: string[];
  /** From `dialectOf`. */
  dialect: number;
}

export type GrammarResponse = { id: number; blocks: GrammarLint[][] } | { id: number; error: true };

declare const self: DedicatedWorkerGlobalScope;

interface Harper {
  linter: LocalLinter;
  /** Harper's dialects, in the order of `dialectOf`. */
  dialects: Dialect[];
}

let harper: Promise<Harper> | null = null;

function load(): Promise<Harper> {
  harper ??= Promise.all([import('harper.js'), import('harper.js/slimBinary')]).then(
    async ([{ LocalLinter, Dialect: D }, { slimBinary }]) => {
      const linter = new LocalLinter({ binary: slimBinary });
      await linter.setup();
      return { linter, dialects: [D.American, D.British, D.Australian, D.Canadian, D.Indian] };
    },
  );
  return harper;
}

/** The text that a fix puts in place of the problem. */
function fixText(problem: string, kind: number, replacement: string): string {
  // SuggestionKind: 0 replaces, 1 removes, 2 inserts after the problem.
  if (kind === 1) return '';
  return kind === 2 ? problem + replacement : replacement;
}

function lintsOf(text: string, found: Record<string, Lint[]>): GrammarLint[] {
  const offsets = utf16Offsets(text);
  const lints: GrammarLint[] = [];
  for (const [rule, list] of Object.entries(found)) {
    for (const lint of list) {
      const span = lint.span();
      const from = offsets[span.start];
      const to = offsets[span.end];
      if (from === undefined || to === undefined || from >= to) continue;
      const problem = text.slice(from, to);
      // The placeholder of a footnote or an equation is not a word of the writer.
      if (problem.includes(OBJECT)) continue;
      lints.push({
        from,
        to,
        rule,
        kind: lint.lint_kind_pretty(),
        message: lint.message(),
        fixes: cleanFixes(
          problem,
          lint.suggestions().map((s) => fixText(problem, s.kind(), s.get_replacement_text())),
        ),
      });
    }
  }
  return lints.sort((a, b) => a.from - b.from);
}

self.onmessage = (event: MessageEvent<GrammarRequest>) => {
  const { id, blocks, dialect } = event.data;
  load()
    .then(async ({ linter, dialects }) => {
      const wanted = dialects[dialect] ?? dialects[0];
      if (wanted !== undefined && (await linter.getDialect()) !== wanted) await linter.setDialect(wanted);
      const result: GrammarLint[][] = [];
      for (const text of blocks)
        result.push(
          text.trim() === ''
            ? []
            : lintsOf(text, await linter.organizedLints(text, { language: 'plaintext' })),
        );
      self.postMessage({ id, blocks: result } satisfies GrammarResponse);
    })
    .catch(() => {
      // The next request tries the download again, such as after the device goes online.
      harper = null;
      self.postMessage({ id, error: true } satisfies GrammarResponse);
    });
};
