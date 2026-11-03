import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { useSyncExternalStore } from 'react';
import { setDucked } from '@/features/sound/controller';
import { sentencesIn, type Sentence } from './sentences';
import { findLocalVoice, speechAvailable } from './voices';

/*
 * Read aloud (plan E2). It speaks one sentence at a time with an on-device voice and marks the sentence
 * that it speaks. Pause stops after the current word and Resume starts that sentence again, which works
 * the same in every browser. The writer can edit while it reads: the sentences move with the text.
 * Background sound plays more quietly while Vlo reads.
 */

export type ReadStatus = 'idle' | 'reading' | 'paused';

export interface ReadState {
  status: ReadStatus;
  editor: Editor | null;
  /** The sentence that is spoken now, counted from 0. */
  index: number;
  count: number;
  message: string | null;
}

export interface ReadSettings {
  /** The URI of the chosen voice, or null for the device default. */
  voice: string | null;
  /** 0.5 to 2, where 1 is the voice's own speed. */
  rate: number;
}

const SETTINGS_KEY = 'vlo:readAloud';
export const READ_DEFAULTS: ReadSettings = { voice: null, rate: 1 };
export const MIN_RATE = 0.5;
export const MAX_RATE = 2;

export function cleanReadSettings(value: unknown): ReadSettings {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Partial<Record<string, unknown>>;
  const rate = typeof raw.rate === 'number' && Number.isFinite(raw.rate) ? raw.rate : READ_DEFAULTS.rate;
  return {
    voice: typeof raw.voice === 'string' && raw.voice !== '' ? raw.voice : null,
    rate: Math.min(MAX_RATE, Math.max(MIN_RATE, Math.round(rate * 10) / 10)),
  };
}

export function getReadSettings(): ReadSettings {
  try {
    return cleanReadSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null'));
  } catch {
    return READ_DEFAULTS;
  }
}

export function setReadSettings(change: Partial<ReadSettings>): ReadSettings {
  const next = cleanReadSettings({ ...getReadSettings(), ...change });
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // A full or blocked storage keeps the choice for this visit only.
  }
  return next;
}

/* The mark on the sentence that is spoken. */

export const readKey = new PluginKey<DecorationSet>('readAloud');

type ReadMeta = { mark: { from: number; to: number } } | { clear: true };

export const ReadAloudMark = Extension.create({
  name: 'readAloudMark',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: readKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const meta = tr.getMeta(readKey) as ReadMeta | undefined;
            if (meta && 'clear' in meta) return DecorationSet.empty;
            if (meta && 'mark' in meta) {
              return DecorationSet.create(tr.doc, [
                Decoration.inline(meta.mark.from, meta.mark.to, { class: 'vlo-reading' }),
              ]);
            }
            return set.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations: (state) => readKey.getState(state),
        },
      }),
    ];
  },
});

/* The reader. */

let state: ReadState = { status: 'idle', editor: null, index: 0, count: 0, message: null };
const listeners = new Set<() => void>();
let sentences: Sentence[] = [];
/** Bumped on every start and stop, so the events of an old utterance do nothing. */
let run = 0;
let unhook: (() => void) | null = null;

function setState(change: Partial<ReadState>): void {
  state = { ...state, ...change };
  for (const listener of listeners) listener();
}

export function getReadState(): ReadState {
  return state;
}

export function useReadState(): ReadState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getReadState,
    getReadState,
  );
}

/** True while this editor reads aloud or holds a paused reading. */
export function isReading(editor: Editor): boolean {
  return state.editor === editor && state.status !== 'idle';
}

function mark(editor: Editor, sentence: Sentence | null): void {
  if (editor.isDestroyed) return;
  const meta: ReadMeta = sentence ? { mark: { from: sentence.from, to: sentence.to } } : { clear: true };
  editor.view.dispatch(editor.state.tr.setMeta(readKey, meta).setMeta('addToHistory', false));
  if (sentence) {
    const element = editor.view.dom.querySelector('.vlo-reading');
    element?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

/** Sentences move with the writer's edits. A sentence the writer deleted is skipped. */
function follow(editor: Editor): () => void {
  const onTransaction = ({ transaction }: { transaction: Transaction }) => {
    if (!transaction.docChanged) return;
    sentences = sentences.map((s) => ({
      ...s,
      from: transaction.mapping.map(s.from, 1),
      to: transaction.mapping.map(s.to, -1),
    }));
  };
  editor.on('transaction', onTransaction);
  return () => {
    editor.off('transaction', onTransaction);
  };
}

function speak(editor: Editor, index: number): void {
  const mine = ++run;
  const sentence = sentences[index];
  if (!sentence) {
    finish(editor, null);
    return;
  }
  if (sentence.to <= sentence.from) {
    speak(editor, index + 1);
    return;
  }
  const settings = getReadSettings();
  const voice = findLocalVoice(settings.voice);
  if (!voice) {
    finish(editor, 'This device has no on-device voice now, so Vlo stopped reading.');
    return;
  }
  // The words as they are now, in case the writer changed the sentence.
  const text = editor.state.doc.textBetween(sentence.from, sentence.to, ' ', ' ').trim() || sentence.text;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  utterance.rate = settings.rate;
  utterance.onend = () => {
    if (mine !== run || state.status !== 'reading') return;
    speak(editor, index + 1);
  };
  utterance.onerror = (event) => {
    if (mine !== run) return;
    // A cancel from Pause or Stop is not a problem.
    if (event.error === 'interrupted' || event.error === 'canceled') return;
    finish(editor, 'The voice stopped with an error. Press Read aloud to try again.');
  };
  setState({ index, status: 'reading' });
  mark(editor, sentence);
  window.speechSynthesis.speak(utterance);
}

function finish(editor: Editor, message: string | null): void {
  run += 1;
  if (speechAvailable()) window.speechSynthesis.cancel();
  unhook?.();
  unhook = null;
  sentences = [];
  mark(editor, null);
  setDucked(false);
  setState({ status: 'idle', editor: null, index: 0, count: 0, message });
}

/**
 * Reads the selection, or from the sentence at the cursor to the end of the text. Call it from the
 * writer's click or key, so the browser lets the voice speak.
 */
export function startReading(editor: Editor): void {
  if (state.editor && state.status !== 'idle') finish(state.editor, null);
  if (!speechAvailable()) {
    setState({ message: 'This browser cannot read aloud.' });
    return;
  }
  if (!findLocalVoice(getReadSettings().voice)) {
    setState({
      message:
        'This device has no on-device voice. Vlo reads only with on-device voices, so your words stay on this device.',
    });
    return;
  }
  const { doc, selection } = editor.state;
  let found: Sentence[];
  if (!selection.empty) found = sentencesIn(doc, selection.from, selection.to);
  else {
    const all = sentencesIn(doc);
    // From the sentence that holds the cursor, or the next one after it.
    const start = all.findIndex((s) => s.to >= selection.from);
    found = start === -1 ? [] : all.slice(start);
  }
  if (found.length === 0) {
    setState({ message: 'There is no text after the cursor to read. Move the cursor or select some words.' });
    return;
  }
  sentences = found;
  unhook = follow(editor);
  setState({ status: 'reading', editor, index: 0, count: found.length, message: null });
  setDucked(true);
  window.speechSynthesis.cancel();
  speak(editor, 0);
}

export function pauseReading(): void {
  if (state.status !== 'reading') return;
  run += 1;
  window.speechSynthesis.cancel();
  setState({ status: 'paused' });
}

export function resumeReading(): void {
  if (state.status !== 'paused' || !state.editor) return;
  speak(state.editor, state.index);
}

export function stopReading(): void {
  if (state.editor) finish(state.editor, null);
}

export function dismissReadMessage(): void {
  setState({ message: null });
}

/** Stops reading when its editor closes. */
export function stopReadingFor(editor: Editor): void {
  if (state.editor === editor) finish(editor, null);
}
