import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { useSyncExternalStore } from 'react';
import { setDucked } from '@/features/sound/controller';
import type { CodexMatch } from '@/features/codex/codex';
import {
  NATURAL_DEFAULT,
  NATURAL_MAX_RATE,
  NATURAL_MIN_RATE,
  naturalLanguage,
  naturalVoiceOf,
} from '@/features/voice/natural';
import {
  forgetAudio,
  naturalAudio,
  playAudio,
  stopAudio,
  unlockAudio,
  type NaturalAudio,
} from '@/features/voice/naturalSpeech';
import { castSentences } from './dialogue';
import { sentencesIn, spokenText, type Sentence } from './sentences';
import { findLocalVoice, speechAvailable } from './voices';

/*
 * Read aloud (plan E2). It speaks one sentence at a time and marks the sentence that it speaks, with no
 * limit on the length of the text. A natural voice makes the audio of the next sentences while one plays;
 * a device voice speaks through the browser. Both run on this device. Pause stops the voice and Resume
 * starts that sentence again, which works the same in every browser. The writer can edit while it reads:
 * the sentences move with the text. Background sound plays more quietly while Vlo reads.
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
  /** The URI of the chosen voice: a natural voice, a device voice, or null for the device default. */
  voice: string | null;
  /** 0.5 to 2, where 1 is the voice's own speed. */
  rate: number;
}

const SETTINGS_KEY = 'vlo:readAloud';
export const READ_DEFAULTS: ReadSettings = { voice: NATURAL_DEFAULT, rate: 1 };
export const MIN_RATE = 0.5;
export const MAX_RATE = 2;

export function cleanReadSettings(value: unknown): ReadSettings {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Partial<Record<string, unknown>>;
  const rate = typeof raw.rate === 'number' && Number.isFinite(raw.rate) ? raw.rate : READ_DEFAULTS.rate;
  return {
    voice:
      typeof raw.voice === 'string' && raw.voice !== ''
        ? raw.voice
        : raw.voice === null
          ? null
          : READ_DEFAULTS.voice,
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
/** The language of the text, for the natural voices. */
let language: string | undefined;
/** The audio of natural voices for the sentence that is spoken and the next ones, by index. */
const ahead = new Map<number, { key: string; audio: Promise<NaturalAudio> }>();
/** The sentences after the one that is spoken whose audio a natural voice makes in advance. */
const AHEAD = 2;

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

/**
 * The voice that reads with the URI `uri`. A natural voice gives way to the device default in a language
 * that the natural voices do not speak.
 */
export function voiceIn(uri: string | null, lang: string | undefined): string | null {
  return naturalVoiceOf(uri) && naturalLanguage(lang) === null ? null : uri;
}

const voiceOfSentence = (sentence: Sentence) =>
  voiceIn(sentence.voice === undefined ? getReadSettings().voice : sentence.voice, language);

/** The words of a sentence as they are now, in case the writer changed it. */
const wordsOf = (editor: Editor, sentence: Sentence) =>
  editor.state.doc.textBetween(sentence.from, sentence.to, ' ', ' ').trim() || sentence.text;

/** The audio of sentence `index` in its natural voice, made once, or null for a device voice. */
function audioFor(editor: Editor, index: number): Promise<NaturalAudio> | null {
  const sentence = sentences[index];
  const voice = sentence ? naturalVoiceOf(voiceOfSentence(sentence)) : null;
  const lang = naturalLanguage(language);
  if (!sentence || !voice || !lang || sentence.to <= sentence.from) return null;
  const rate = Math.min(NATURAL_MAX_RATE, Math.max(NATURAL_MIN_RATE, getReadSettings().rate));
  // The model's own pace is 1.05 times its speed 1, which sounds the most natural.
  const speed = Math.round(rate * 1.05 * 100) / 100;
  const text = wordsOf(editor, sentence);
  const key = [voice, speed, lang, text].join('\n');
  const made = ahead.get(index);
  if (made?.key === key) return made.audio;
  const audio = naturalAudio(text, voice, speed, lang);
  // A rejection here is handled where the audio plays.
  audio.catch(() => undefined);
  ahead.set(index, { key, audio });
  return audio;
}

function speakNatural(editor: Editor, index: number, audio: Promise<NaturalAudio>, mine: number): void {
  for (const at of ahead.keys()) if (at < index) ahead.delete(at);
  // The audio of the next sentences, made while this one plays.
  for (let next = index + 1; next <= index + AHEAD; next++) void audioFor(editor, next);
  audio.then(
    (made) => {
      if (mine !== run || state.status !== 'reading') return;
      playAudio(made, () => {
        if (mine === run && state.status === 'reading') speak(editor, index + 1);
      });
    },
    () => {
      if (mine === run)
        finish(editor, 'The natural voice stopped with an error. Press Read aloud to try again.');
    },
  );
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
  const audio = audioFor(editor, index);
  if (audio) {
    setState({ index, status: 'reading' });
    mark(editor, sentence);
    speakNatural(editor, index, audio, mine);
    return;
  }
  const settings = getReadSettings();
  const voice = findLocalVoice(voiceOfSentence(sentence));
  if (!voice) {
    finish(editor, 'This device has no on-device voice now, so Vlo stopped reading.');
    return;
  }
  const text = wordsOf(editor, sentence);
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
  stopAudio();
  forgetAudio();
  ahead.clear();
  if (speechAvailable()) window.speechSynthesis.cancel();
  unhook?.();
  unhook = null;
  sentences = [];
  mark(editor, null);
  setDucked(false);
  setState({ status: 'idle', editor: null, index: 0, count: 0, message });
}

/** A table read (F58): the characters' names and the voice of each speaker. */
export interface Cast {
  match: (text: string) => CodexMatch[];
  /** The speaker of a script's character line (F63). */
  cue: (text: string) => string | null;
  voiceOf: (speaker: string | null) => string | null;
}

/**
 * Reads the selection, or from the sentence at the cursor to the end of the text. Call it from the
 * writer's click or key, so the browser lets the voice speak. With a cast, each character's quotes
 * get the character's voice. `textLanguage` is the language of the text, for the natural voices.
 */
export function startReading(editor: Editor, cast?: Cast, textLanguage?: string): void {
  if (state.editor && state.status !== 'idle') finish(state.editor, null);
  language = textLanguage;
  const natural = naturalVoiceOf(voiceIn(getReadSettings().voice, language)) !== null;
  if (natural || cast) unlockAudio();
  if (!natural && !speechAvailable()) {
    setState({ message: 'This browser cannot read aloud.' });
    return;
  }
  if (!natural && !findLocalVoice(getReadSettings().voice)) {
    setState({
      message:
        'This device has no on-device voice. Vlo reads only with on-device voices, so your words stay on this device.',
    });
    return;
  }
  const { doc, selection } = editor.state;
  let found: Sentence[];
  if (cast) {
    const { from, to, empty } = selection;
    // A selection cuts the sentences at its ends, as a plain read does.
    found = castSentences(doc, cast.match, cast.voiceOf, cast.cue)
      .filter((s) => (empty ? s.to >= from : s.to > from && s.from < to))
      .map((s) => {
        if (empty || (s.from >= from && s.to <= to)) return s;
        const cut = { from: Math.max(s.from, from), to: Math.min(s.to, to) };
        return { ...s, ...cut, text: spokenText(doc, cut.from, cut.to) };
      })
      .filter((s) => /[\p{L}\p{N}]/u.test(s.text));
  } else if (!selection.empty) found = sentencesIn(doc, selection.from, selection.to);
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
  if (speechAvailable()) window.speechSynthesis.cancel();
  speak(editor, 0);
}

export function pauseReading(): void {
  if (state.status !== 'reading') return;
  run += 1;
  stopAudio();
  if (speechAvailable()) window.speechSynthesis.cancel();
  setState({ status: 'paused' });
}

export function resumeReading(): void {
  if (state.status !== 'paused' || !state.editor) return;
  unlockAudio();
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
