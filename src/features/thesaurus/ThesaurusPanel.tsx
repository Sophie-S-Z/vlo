import type { Editor } from '@tiptap/core';
import { useId, useState } from 'react';
import { focusText } from '@/features/editor/commands/editorBus';
import type { EditorForm } from '@/features/editor/commands/registry';
import { wordRange } from '@/features/editor/extensions/textCase';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { Segmented } from '@/ui/segmented';
import { inCaseOf } from './thesaurus';
import { RhymeList, SynonymList } from './WordLists';

/*
 * The thesaurus card at the word (Phase 19, Task D2). It looks up the word at the caret, or another word
 * that the writer types. A click on a word replaces the word at the caret, in its case and with its marks.
 * A poem gets a Rhymes tab too.
 */

interface Target {
  from: number;
  to: number;
  text: string;
}

/** Puts the word in place of the target, or at the caret when the target changed or there is none. */
function replaceWord(editor: Editor, target: Target | null, word: string): void {
  const { state } = editor;
  const same = target !== null && state.doc.textBetween(target.from, target.to) === target.text;
  // insertText keeps the marks that run across the replaced word, such as bold.
  const tr = same
    ? state.tr.insertText(inCaseOf(target.text, word), target.from, target.to)
    : state.tr.insertText(word);
  editor.view.dispatch(tr.scrollIntoView());
  focusText(editor);
}

export function ThesaurusPanel({
  editor,
  form,
  onDone,
}: {
  editor: Editor;
  form: EditorForm;
  onDone: () => void;
}) {
  const id = useId();
  const [target] = useState<Target | null>(() => {
    const range = wordRange(editor.state);
    return range ? { ...range, text: editor.state.doc.textBetween(range.from, range.to) } : null;
  });
  const [typed, setTyped] = useState(target?.text ?? '');
  const [word, setWord] = useState(typed);
  const [tab, setTab] = useState<'words' | 'rhymes'>('words');

  return (
    <div className="grid gap-3">
      <h2 className="text-sm font-medium">Thesaurus</h2>
      <form
        className="grid gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          setWord(typed.trim());
        }}
      >
        <Label htmlFor={`${id}-word`}>Word</Label>
        <Input
          id={`${id}-word`}
          type="search"
          autoComplete="off"
          spellCheck={false}
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
          }}
          aria-describedby={`${id}-help`}
        />
        <p id={`${id}-help`} className="text-xs text-muted">
          Press Enter to look up another word.
        </p>
      </form>
      {form === 'poem' && (
        <Segmented
          label="Show"
          options={[
            { value: 'words', label: 'Synonyms' },
            { value: 'rhymes', label: 'Rhymes' },
          ]}
          value={tab}
          onChange={setTab}
        />
      )}
      <div className="max-h-[min(50dvh,22rem)] overflow-y-auto overscroll-contain pr-1">
        {word === '' ? (
          <p className="text-sm text-muted">Type a word, or put the cursor in a word first.</p>
        ) : tab === 'rhymes' && form === 'poem' ? (
          <RhymeList word={word} />
        ) : (
          <SynonymList
            word={word}
            onChoose={(choice) => {
              replaceWord(editor, target, choice);
              onDone();
            }}
          />
        )}
      </div>
    </div>
  );
}
