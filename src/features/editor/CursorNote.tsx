import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { useState, useSyncExternalStore } from 'react';
import { styleReason } from '@/features/analysis/style';
import { CODEX_KINDS, entryAt } from '@/features/codex/codex';
import { getCodex } from '@/features/codex/codexStore';
import { continuityReason, keepContinuity, sceneKey, type ContinuityNote } from '@/features/codex/continuity';
import { Button } from '@/ui/button';
import { canOpenBeside, followLink, linkShows, useLinks, type LinkTarget } from '@/features/links/linkStore';
import { codexEntryAt } from './extensions/codexNames';
import { linkAt, targetOf, unlink } from './extensions/itemLink';
import { linkText } from './format/itemLink';
import { continuityNoteAt } from './extensions/continuityCheck';
import { styleNoteAt } from './extensions/styleCheck';
import { cellPlace } from './extensions/table';
import {
  canCheckGrammar,
  getGrammarStatus,
  grammarLintAt,
  subscribeGrammarStatus,
} from './extensions/grammar';
import { addWord, ignoreMark, setRuleOn, useGrammarPrefs } from '@/features/grammar/grammarPrefs';
import { ruleLabel, type GrammarLint } from '@/features/grammar/lints';

interface GrammarAt {
  lint: GrammarLint;
  from: number;
  to: number;
  words: string;
}

interface LinkNote {
  pos: number;
  target: LinkTarget | null;
  broken: boolean;
}

interface Note {
  text: string;
  continuity: ContinuityNote | null;
  grammar: GrammarAt | null;
  link: LinkNote | null;
}

const NO_NOTE: Note = { text: '', continuity: null, grammar: null, link: null };

/** Harper's message for people: a `code` quote becomes a curly quote. */
const grammarText = (lint: GrammarLint) => `${lint.kind}: ${lint.message.replace(/`([^`]*)`/g, '“$1”')}`;

/**
 * A line under the toolbar about the words at the cursor: why the continuity check (F66), the spelling and
 * grammar check (Phase 19, Task D1) or the style check (F47) marks them, or the Codex entry of a name (F42).
 * A click or the arrow keys put the cursor there, so the mouse and the keyboard both show it. The live
 * region stays in the page, so a screen reader reads each new line. A Codex entry shows as it is at the
 * open item (F65). A continuity mark has "Not a problem", which keeps it in the project. A spelling or
 * grammar mark has its fixes, "Add to dictionary", "Ignore" and "Turn off this rule". A link to an item
 * (Task F1) has "Open", "Open beside" and "Remove link". In a table (Task F2), the line gives the row and the
 * column of the caret.
 */
export function CursorNote({ editor, itemId }: { editor: Editor; itemId: string | undefined }) {
  const [problem, setProblem] = useState('');
  const grammarOn = useGrammarPrefs().on;
  const status = useSyncExternalStore(subscribeGrammarStatus, getGrammarStatus, getGrammarStatus);
  // The link text changes with a rename, so the line reads the links too.
  useLinks();
  const { text, continuity, grammar, link, checking } = useEditorState({
    editor,
    selector: ({ editor: e }): Note & { checking: boolean } => ({
      ...noteAt(e.state),
      checking: canCheckGrammar(e.state),
    }),
  });

  function noteAt(state: Editor['state']): Note {
    const link = linkAt(state);
    if (link) {
      const target = targetOf(link.node);
      const shown = linkShows(target ?? { item: '' }, linkText(link.node.attrs));
      return {
        ...NO_NOTE,
        text: shown.broken
          ? 'This link goes to an item that the project no longer has.'
          : `Link to “${shown.text}”.`,
        link: { pos: link.pos, target, broken: shown.broken },
      };
    }
    const codex = getCodex();
    const mark = continuityNoteAt(state);
    if (mark) {
      const name = codex.entries.find((entry) => entry.id === mark.entryId)?.name ?? '';
      const leftIn = codex.titles.get(mark.leftIn ?? '') ?? 'an earlier scene';
      return { ...NO_NOTE, text: continuityReason(mark, name, leftIn), continuity: mark };
    }
    const lint = grammarLintAt(state);
    if (lint) {
      const words = state.doc.textBetween(lint.from, lint.to, ' ', ' ');
      return { ...NO_NOTE, text: grammarText(lint.lint), grammar: { ...lint, words } };
    }
    const style = styleNoteAt(state);
    if (style) return { ...NO_NOTE, text: styleReason(style.kind, style.text, style.use) };
    const found = codexEntryAt(state);
    if (!found) {
      // In a table, the line says where the caret is, so a screen reader hears the row and column.
      const place = cellPlace(state);
      return place
        ? {
            ...NO_NOTE,
            text: `Table, row ${String(place.row)} of ${String(place.rows)}, column ${String(place.column)} of ${String(place.columns)}.`,
          }
        : NO_NOTE;
    }
    const entry = itemId === undefined ? found : entryAt(found, codex.places, itemId);
    const kind = CODEX_KINDS.find((k) => k.id === entry.kind)?.label ?? '';
    return {
      ...NO_NOTE,
      text: `${entry.name}, ${kind.toLowerCase()}${entry.note ? `: ${entry.note}` : '.'}`,
    };
  }

  /** Puts the fix in place of the marked words, with the marks of the first word. */
  const fix = (at: GrammarAt, replacement: string) => {
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        if (tr.doc.textBetween(at.from, at.to, ' ', ' ') !== at.words) return false;
        if (replacement === '') tr.delete(at.from, at.to);
        else tr.insertText(replacement, at.from, at.to);
        return true;
      })
      .run();
  };

  const settled = (done: () => void) => {
    done();
    editor.commands.focus();
  };

  // While no mark is at the cursor, the line says when the checker loads or cannot load.
  const loadText =
    !grammarOn || !checking || status === 'idle'
      ? ''
      : status === 'loading'
        ? 'Loading the spelling and grammar check on this device.'
        : 'Vlo could not load the spelling and grammar check. It tries again at your next pause.';

  const keep = (mark: ContinuityNote) => {
    const projectId = getCodex().projectId;
    if (projectId === null || itemId === undefined) return;
    keepContinuity(
      projectId,
      mark.rule === 'near-name' ? { word: mark.word } : { scene: sceneKey(mark.entryId, itemId) },
    ).then(
      () => {
        setProblem('');
        editor.commands.focus();
      },
      () => {
        setProblem('Vlo could not save that on this device.');
      },
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-x-2">
      <p role="status" className="text-sm text-muted empty:hidden" data-vlo-cursor-note="">
        {text || loadText}
      </p>
      {grammar && (
        <>
          {grammar.lint.fixes.map((replacement) => (
            <Button
              key={replacement}
              variant="outline"
              className="min-h-9 px-2 pointer-coarse:min-h-11"
              aria-label={
                replacement === ''
                  ? `Delete “${grammar.words}”`
                  : `Change “${grammar.words}” to “${replacement}”`
              }
              onClick={() => {
                fix(grammar, replacement);
              }}
            >
              {replacement === '' ? 'Delete' : replacement}
            </Button>
          ))}
          {grammar.lint.kind === 'Spelling' && !/\s/.test(grammar.words) && (
            <Button
              variant="ghost"
              className="px-2 pointer-fine:min-h-9"
              onClick={() => {
                settled(() => addWord(grammar.words));
              }}
            >
              Add to dictionary
            </Button>
          )}
          {itemId !== undefined && (
            <Button
              variant="ghost"
              className="px-2 pointer-fine:min-h-9"
              aria-label={`Ignore this mark on “${grammar.words}” in this item`}
              onClick={() => {
                settled(() => {
                  ignoreMark(itemId, grammar.lint.rule, grammar.words);
                });
              }}
            >
              Ignore
            </Button>
          )}
          <Button
            variant="ghost"
            className="px-2 pointer-fine:min-h-9"
            aria-label={`Turn off the rule “${ruleLabel(grammar.lint.rule)}”`}
            onClick={() => {
              settled(() => {
                setRuleOn(grammar.lint.rule, false);
              });
            }}
          >
            Turn off this rule
          </Button>
        </>
      )}
      {continuity && (
        <Button
          variant="ghost"
          className="px-2 pointer-fine:min-h-9"
          onClick={() => {
            keep(continuity);
          }}
        >
          Not a problem
        </Button>
      )}
      {link && (
        <>
          {!link.broken && link.target && (
            <Button
              variant="outline"
              className="min-h-9 px-2 pointer-coarse:min-h-11"
              onClick={() => {
                if (link.target) followLink(link.target);
              }}
            >
              Open
            </Button>
          )}
          {!link.broken && link.target && canOpenBeside() && (
            <Button
              variant="ghost"
              className="px-2 pointer-fine:min-h-9"
              onClick={() => {
                if (link.target) followLink(link.target, true);
              }}
            >
              Open beside
            </Button>
          )}
          <Button
            variant="ghost"
            className="px-2 pointer-fine:min-h-9"
            onClick={() => {
              unlink(editor, link.pos);
            }}
          >
            Remove link
          </Button>
        </>
      )}
      {problem && (
        <p role="alert" className="text-sm text-accent-text">
          {problem}
        </p>
      )}
    </div>
  );
}
