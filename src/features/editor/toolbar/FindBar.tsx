import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { CaseSensitive, ChevronDown, ChevronUp, WholeWord, X } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { Input } from '@/ui/input';
import { shortcutLabel } from '../commands/keys';
import { closeFind, type FindRequest } from '../commands/editorBus';
import {
  endFind,
  getFindState,
  MAX_MATCHES,
  replaceAll,
  replaceCurrent,
  setFindQuery,
  stepMatch,
  type FindQuery,
} from '../extensions/findReplace';
import { toolClass } from './ToolButton';

/*
 * The find and replace bar under the toolbar (plan E1). Mod-F puts focus in Find and Mod-H in Replace.
 * Enter finds the next match, Shift-Enter the previous one, and Escape returns to the text with the
 * current match selected. The last search stays for the next time the bar opens.
 */

let lastQuery: FindQuery = { text: '', caseSensitive: false, wholeWord: false };
let lastReplacement = '';

/** Selected text in one line becomes the search, as in other editors. */
function selectedWords(editor: Editor): string | null {
  const { from, to, empty } = editor.state.selection;
  if (empty) return null;
  const text = editor.state.doc.textBetween(from, to, '\n', '\n');
  return text.includes('\n') || text.length > 200 ? null : text;
}

function scrollToCurrent(editor: Editor): void {
  const element = editor.view.dom.querySelector('.vlo-find-current');
  element?.scrollIntoView({ block: 'center', inline: 'nearest' });
}

function fieldToFocus(field: FindRequest['field'], findText: string): FindRequest['field'] {
  return field === 'replace' && findText !== '' ? 'replace' : 'find';
}

function countText(count: number, current: number, text: string): string {
  if (text === '') return '';
  if (count === 0) return 'No matches';
  const total = count >= MAX_MATCHES ? `${String(MAX_MATCHES)}+` : String(count);
  return `${String(current + 1)} of ${total}`;
}

export function FindBar({ editor, request }: { editor: Editor; request: FindRequest }) {
  const findId = useId();
  const replaceId = useId();
  const findInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState<FindQuery>(() => {
    const picked = selectedWords(editor);
    return picked === null ? lastQuery : { ...lastQuery, text: picked };
  });
  const [replacement, setReplacement] = useState(lastReplacement);
  const [message, setMessage] = useState('');
  // Mod-H goes to Replace only when there is something to find. With an empty Find, it goes there first.
  const [focusField, setFocusField] = useState<FindRequest['field']>(() =>
    fieldToFocus(request.field, query.text),
  );
  const result = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const state = getFindState(e.state);
      return { count: state.matches.length, current: state.current };
    },
    equalityFn: (a, b) => a.count === b?.count && a.current === b.current,
  });

  // A new request (Mod-F with other words selected) searches for the selected words.
  const [seen, setSeen] = useState(request.at);
  if (seen !== request.at) {
    setSeen(request.at);
    const picked = request.field === 'find' ? selectedWords(editor) : null;
    if (picked !== null) setQuery({ ...query, text: picked });
    setFocusField(fieldToFocus(request.field, picked ?? query.text));
  }

  // Each request (Mod-F, Mod-H or the toolbar) moves focus to its field and selects the text there.
  useLayoutEffect(() => {
    const input = focusField === 'replace' ? replaceInput.current : findInput.current;
    input?.focus();
    input?.select();
  }, [request, focusField]);

  // The search runs as the writer types it.
  useEffect(() => {
    lastQuery = query;
    if (editor.isDestroyed) return;
    setFindQuery(editor, query);
    scrollToCurrent(editor);
  }, [editor, query]);

  useEffect(() => {
    lastReplacement = replacement;
  }, [replacement]);

  // The marks go away with the bar.
  useEffect(
    () => () => {
      endFind(editor, false);
    },
    [editor],
  );

  const close = () => {
    endFind(editor, true);
    closeFind();
  };

  // Escape on any control of the bar, such as Replace all, returns to the text.
  const bar = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = bar.current;
    if (!element) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      endFind(editor, true);
      closeFind();
    };
    element.addEventListener('keydown', onKey);
    return () => {
      element.removeEventListener('keydown', onKey);
    };
  }, [editor]);

  const step = (direction: 1 | -1) => {
    stepMatch(editor, direction);
    scrollToCurrent(editor);
  };

  const replaceOne = () => {
    if (replaceCurrent(editor, replacement)) {
      const left = getFindState(editor.state).matches.length;
      setMessage(`Replaced 1. ${left === 0 ? 'No more matches.' : `${String(left)} left.`}`);
      scrollToCurrent(editor);
      if (left === 0 && document.activeElement instanceof HTMLButtonElement) findInput.current?.focus();
    }
  };

  const replaceEvery = () => {
    const count = replaceAll(editor, replacement);
    if (count > 0) setMessage(`Replaced ${String(count)}. Undo puts them all back.`);
    // The replace buttons turn off with no matches left, so focus goes back to the search.
    findInput.current?.focus();
  };

  const onFindKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      step(event.shiftKey ? -1 : 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      event.currentTarget.select();
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'h') {
      event.preventDefault();
      replaceInput.current?.focus();
    }
  };

  const onReplaceKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.metaKey || event.ctrlKey) replaceEvery();
      else replaceOne();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      findInput.current?.focus();
      findInput.current?.select();
    }
  };

  const count = countText(result.count, result.current, query.text);
  const none = query.text !== '' && result.count === 0;
  const toggle = (on: boolean) => cn(toolClass, on && 'bg-surface text-accent-text');

  return (
    <section
      role="search"
      aria-label="Find and replace"
      className="grid gap-1.5 border-b border-rule bg-bg px-1 py-2"
      ref={bar}
    >
      <div className="flex flex-wrap items-center gap-1">
        <label htmlFor={findId} className="sr-only">
          Find
        </label>
        <div className="relative min-w-0 flex-1 basis-40">
          <Input
            ref={findInput}
            id={findId}
            value={query.text}
            placeholder="Find"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={none || undefined}
            aria-describedby={`${findId}-count`}
            onChange={(event) => {
              setQuery({ ...query, text: event.target.value });
              setMessage('');
            }}
            onKeyDown={onFindKey}
            className="min-h-9 pr-24 text-sm"
          />
          <span
            id={`${findId}-count`}
            role="status"
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-xs text-muted"
          >
            {count}
          </span>
        </div>
        <button
          type="button"
          aria-label="Previous match"
          title="Previous match (Shift+Enter)"
          disabled={result.count === 0}
          className={toolClass}
          onClick={() => {
            step(-1);
          }}
        >
          <ChevronUp aria-hidden="true" className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Next match"
          title="Next match (Enter)"
          disabled={result.count === 0}
          className={toolClass}
          onClick={() => {
            step(1);
          }}
        >
          <ChevronDown aria-hidden="true" className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Close find and replace"
          title="Close (Escape)"
          className={toolClass}
          onClick={close}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
      {/* The search options sit under Find, before Replace, so the keyboard order follows the screen. */}
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          aria-label="Match case"
          aria-pressed={query.caseSensitive}
          title="Match case"
          className={toggle(query.caseSensitive)}
          onClick={() => {
            setQuery({ ...query, caseSensitive: !query.caseSensitive });
          }}
        >
          <CaseSensitive aria-hidden="true" className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Whole word"
          aria-pressed={query.wholeWord}
          title="Whole word"
          className={toggle(query.wholeWord)}
          onClick={() => {
            setQuery({ ...query, wholeWord: !query.wholeWord });
          }}
        >
          <WholeWord aria-hidden="true" className="size-4" />
        </button>
        <label htmlFor={replaceId} className="sr-only">
          Replace with
        </label>
        <Input
          ref={replaceInput}
          id={replaceId}
          value={replacement}
          placeholder="Replace with"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setReplacement(event.target.value);
          }}
          onKeyDown={onReplaceKey}
          className="min-h-9 min-w-0 flex-1 basis-40 text-sm"
        />
        <Button
          variant="outline"
          disabled={result.count === 0}
          title="Replace (Enter)"
          className="min-h-9 px-3 pointer-coarse:min-h-11"
          onClick={replaceOne}
        >
          Replace
        </Button>
        <Button
          variant="outline"
          disabled={result.count === 0}
          title={`Replace all (${shortcutLabel('Mod-Enter')})`}
          className="min-h-9 px-3 pointer-coarse:min-h-11"
          onClick={replaceEvery}
        >
          Replace all
        </Button>
      </div>
      <p role="status" className={cn('px-1 text-xs text-muted', message === '' && 'sr-only')}>
        {message}
      </p>
    </section>
  );
}
