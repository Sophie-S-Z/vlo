import { Editor } from '@tiptap/core';
import * as Y from 'yjs';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  endFind,
  findMatches,
  FindReplace,
  getFindState,
  queryPattern,
  replaceAll,
  replaceCurrent,
  setFindQuery,
  stepMatch,
  type FindQuery,
} from '@/features/editor/extensions/findReplace';
import { poemExtensions } from '@/features/editor/extensions/poem';
import { proseExtensions } from '@/features/editor/extensions/prose';
import {
  cleanReadSettings,
  getReadState,
  pauseReading,
  ReadAloudMark,
  readKey,
  resumeReading,
  setReadSettings,
  startReading,
  stopReading,
} from '@/features/editor/readAloud/reader';
import { sentencesIn, splitSentences } from '@/features/editor/readAloud/sentences';
import { findLocalVoice, localVoices } from '@/features/editor/readAloud/voices';
import {
  cleanDayStart,
  dayStartKey,
  localDay,
  minutesLabel,
  textStats,
  wordsToday,
} from '@/features/editor/stats/stats';
import { clock } from '@/lib/clock';
import { db } from '@/lib/db';

// jsdom has no layout, so scrolling a mark into view does nothing here.
beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
});

const editors: Editor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
});

function mount(kind: 'prose' | 'poem', html: string, onOpen = vi.fn()) {
  const host = document.createElement('div');
  document.body.append(host);
  const doc = new Y.Doc();
  const base = kind === 'poem' ? poemExtensions(doc, { tabSpaces: 4 }) : proseExtensions(doc);
  const editor = new Editor({
    element: host,
    extensions: [...base, FindReplace.configure({ onOpen }), ReadAloudMark],
  });
  editors.push(editor);
  editor.commands.setContent(html);
  return editor;
}

const q = (text: string, more: Partial<FindQuery> = {}): FindQuery => ({
  text,
  caseSensitive: false,
  wholeWord: false,
  ...more,
});

/** The matched text of each match. */
const found = (e: Editor, query: FindQuery) =>
  findMatches(e.state.doc, query).map((m) => e.state.doc.textBetween(m.from, m.to));

describe('find (E1)', () => {
  test('finds without regard to case by default, and with Match case only the same case', () => {
    const e = mount('prose', '<p>Rain fell. The rain stopped.</p><p>RAIN again.</p>');
    expect(found(e, q('rain'))).toEqual(['Rain', 'rain', 'RAIN']);
    expect(found(e, q('rain', { caseSensitive: true }))).toEqual(['rain']);
  });

  test('Whole word skips the word inside longer words, in any script', () => {
    const e = mount('prose', '<p>The rain, the rainy day, the rains. Café and cafés.</p>');
    expect(found(e, q('rain', { wholeWord: true }))).toEqual(['rain']);
    expect(found(e, q('café', { wholeWord: true }))).toEqual(['Café']);
  });

  test('searches for the characters typed, not a pattern', () => {
    const e = mount('prose', '<p>a.b axb (1+1) [x]</p>');
    expect(found(e, q('a.b'))).toEqual(['a.b']);
    expect(found(e, q('(1+1)'))).toEqual(['(1+1)']);
    expect(found(e, q('[x]'))).toEqual(['[x]']);
    expect(queryPattern(q(''))).toBeNull();
  });

  test('a match stays in one paragraph, and an equation or a note marker breaks it', () => {
    const e = mount('prose', '<p>end</p><p>start</p>');
    expect(found(e, q('endstart'))).toEqual([]);
    expect(found(e, q('end start'))).toEqual([]);
    const m = mount('prose', '<p>ab</p>');
    m.commands.setTextSelection(2);
    m.commands.insertMath('x');
    expect(m.state.doc.textContent).toBe('ab');
    expect(found(m, q('ab'))).toEqual([]);
    expect(found(m, q('a'))).toEqual(['a']);
  });

  test('finds in poem lines with their spaces', () => {
    const e = mount('poem', '<p>the  wide   sea</p><p>the sea</p>');
    expect(found(e, q('wide   sea'))).toEqual(['wide   sea']);
    expect(found(e, q('sea'))).toHaveLength(2);
  });

  test('marks every match, starts at the cursor, and steps round the ends', () => {
    const e = mount('prose', '<p>one cat, two cat, three cat</p>');
    e.commands.setTextSelection(10);
    setFindQuery(e, q('cat'));
    const state = getFindState(e.state);
    expect(state.matches).toHaveLength(3);
    expect(state.current).toBe(1);
    expect(e.view.dom.querySelectorAll('.vlo-find-match')).toHaveLength(3);
    expect(e.view.dom.querySelector('.vlo-find-current')?.textContent).toBe('cat');
    stepMatch(e, 1);
    expect(getFindState(e.state).current).toBe(2);
    stepMatch(e, 1);
    expect(getFindState(e.state).current).toBe(0);
    stepMatch(e, -1);
    expect(getFindState(e.state).current).toBe(2);
  });

  test('the matches follow the text as the writer types', () => {
    const e = mount('prose', '<p>cat</p>');
    setFindQuery(e, q('cat'));
    e.commands.setTextSelection(4);
    e.commands.insertContent(' and cat');
    expect(getFindState(e.state).matches).toHaveLength(2);
  });

  test('Replace keeps the styles of the words and moves on; a replacement that holds the search is skipped', () => {
    const e = mount('prose', '<p><strong>cat</strong> and cat</p>');
    setFindQuery(e, q('cat'));
    expect(replaceCurrent(e, 'cats')).toBe(true);
    expect(e.state.doc.textContent).toBe('cats and cat');
    expect(e.getHTML()).toContain('<strong>cats</strong>');
    const state = getFindState(e.state);
    expect(state.matches).toHaveLength(2);
    expect(
      e.state.doc.textBetween(state.matches[state.current]?.from ?? 0, state.matches[state.current]?.to ?? 0),
    ).toBe('cat');
    expect(state.matches[state.current]?.from).toBeGreaterThan(5);
  });

  test('Replace with nothing deletes the match', () => {
    const e = mount('prose', '<p>very very good</p>');
    setFindQuery(e, q('very '));
    replaceCurrent(e, '');
    expect(e.state.doc.textContent).toBe('very good');
  });

  test('Replace all changes every match in one step that one Undo reverses', () => {
    const e = mount('prose', '<p>grey sky, grey sea</p><p>Grey stone</p>');
    setFindQuery(e, q('grey'));
    expect(replaceAll(e, 'gray')).toBe(3);
    expect(e.state.doc.textContent).toBe('gray sky, gray seagray stone');
    expect(getFindState(e.state).matches).toHaveLength(0);
    e.commands.undo();
    expect(e.state.doc.textContent).toBe('grey sky, grey seaGrey stone');
  });

  test('closing selects the current match, and clears every mark', () => {
    const e = mount('prose', '<p>a needle in a haystack</p>');
    setFindQuery(e, q('needle'));
    endFind(e, true);
    const { from, to } = e.state.selection;
    expect(e.state.doc.textBetween(from, to)).toBe('needle');
    expect(getFindState(e.state).matches).toHaveLength(0);
    expect(e.view.dom.querySelectorAll('.vlo-find-match')).toHaveLength(0);
  });

  test('Mod-F and Mod-H in the text open the bar at their field', () => {
    const onOpen = vi.fn();
    const e = mount('prose', '<p>Text</p>', onOpen);
    const key = (k: string) =>
      e.view.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: k, ctrlKey: true, bubbles: true, cancelable: true }),
      );
    key('f');
    key('h');
    expect(onOpen.mock.calls.map((c) => c[1] as string)).toEqual(['find', 'replace']);
  });
});

describe('read aloud sentences (E2)', () => {
  test('splits text into sentences', () => {
    expect(splitSentences('One. Two? Three!').map((s) => s.text.trim())).toEqual(['One.', 'Two?', 'Three!']);
  });

  test('each sentence knows its place, and a selection cuts the sentences at its ends', () => {
    const e = mount('prose', '<p>The tide came in. The gulls went quiet.</p><p>Night fell.</p>');
    const all = sentencesIn(e.state.doc);
    expect(all.map((s) => s.text)).toEqual(['The tide came in.', 'The gulls went quiet.', 'Night fell.']);
    for (const s of all) expect(e.state.doc.textBetween(s.from, s.to)).toBe(s.text);
    const gulls = all[1];
    if (!gulls) throw new Error('No second sentence.');
    const part = sentencesIn(e.state.doc, gulls.from + 4, gulls.to);
    expect(part.map((s) => s.text)).toEqual(['gulls went quiet.']);
  });

  test('a sentence of only an equation has nothing to say and is skipped', () => {
    const e = mount('prose', '<p>Words here.</p><p></p>');
    e.commands.setTextSelection(e.state.doc.content.size - 1);
    e.commands.insertMath('x^2');
    expect(sentencesIn(e.state.doc).map((s) => s.text)).toEqual(['Words here.']);
  });
});

/** A fake speech engine: it records what it says and ends each sentence when the test says so. */
function fakeSpeech(voices: Partial<SpeechSynthesisVoice>[]) {
  const said: { text: string; voice: string | undefined; rate: number }[] = [];
  class Utterance {
    voice: SpeechSynthesisVoice | null = null;
    rate = 1;
    lang = '';
    onend: ((e: Event) => void) | null = null;
    onerror: ((e: SpeechSynthesisErrorEvent) => void) | null = null;
    constructor(public text: string) {}
  }
  let current: Utterance | null = null;
  const synth = {
    getVoices: () => voices as SpeechSynthesisVoice[],
    speak: (u: Utterance) => {
      said.push({ text: u.text, voice: u.voice?.voiceURI, rate: u.rate });
      current = u;
    },
    cancel: () => {
      const u = current;
      current = null;
      u?.onerror?.(Object.assign(new Event('error'), { error: 'canceled' }) as SpeechSynthesisErrorEvent);
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
  return {
    said,
    finish: () => {
      const u = current;
      current = null;
      u?.onend?.(new Event('end'));
    },
  };
}

const LOCAL = { voiceURI: 'local-1', name: 'Moira', lang: 'en-IE', localService: true, default: true };
const LOCAL_2 = { voiceURI: 'local-2', name: 'Ava', lang: 'en-US', localService: true, default: false };
const REMOTE = { voiceURI: 'cloud-1', name: 'Cloud', lang: 'en-US', localService: false, default: false };

describe('read aloud (E2)', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    stopReading();
    vi.unstubAllGlobals();
  });

  test('offers on-device voices only: the default first, then the writer’s language', () => {
    const list = localVoices([REMOTE, LOCAL_2, LOCAL] as SpeechSynthesisVoice[], 'en-US');
    expect(list.map((v) => v.uri)).toEqual(['local-1', 'local-2']);
    const noDefault = localVoices(
      [{ ...LOCAL, default: false }, LOCAL_2, REMOTE] as SpeechSynthesisVoice[],
      'en-US',
    );
    expect(noDefault.map((v) => v.uri)).toEqual(['local-2', 'local-1']);
  });

  test('never picks a remote voice, even when the setting names one', () => {
    fakeSpeech([REMOTE, LOCAL_2]);
    expect(findLocalVoice('cloud-1')?.voiceURI).toBe('local-2');
    fakeSpeech([REMOTE]);
    expect(findLocalVoice('cloud-1')).toBeNull();
  });

  test('settings stay in range', () => {
    expect(cleanReadSettings({ rate: 9, voice: '' })).toEqual({ rate: 2, voice: null });
    expect(cleanReadSettings({ rate: 0.1, voice: 'x' })).toEqual({ rate: 0.5, voice: 'x' });
    expect(cleanReadSettings('junk')).toEqual({ rate: 1, voice: null });
  });

  test('with no on-device voice it says why and speaks nothing', () => {
    const speech = fakeSpeech([REMOTE]);
    const e = mount('prose', '<p>Hello there.</p>');
    startReading(e);
    expect(speech.said).toEqual([]);
    expect(getReadState().message).toMatch(/no on-device voice/);
  });

  test('reads from the sentence at the cursor, marks it, and goes on to the end', () => {
    const speech = fakeSpeech([LOCAL, REMOTE]);
    setReadSettings({ rate: 1.5 });
    const e = mount('prose', '<p>First one. Second one.</p><p>Third one.</p>');
    e.commands.setTextSelection(14);
    startReading(e);
    expect(speech.said).toEqual([{ text: 'Second one.', voice: 'local-1', rate: 1.5 }]);
    expect(e.view.dom.querySelector('.vlo-reading')?.textContent).toBe('Second one.');
    expect(getReadState()).toMatchObject({ status: 'reading', index: 0, count: 2 });
    speech.finish();
    expect(speech.said.map((s) => s.text)).toEqual(['Second one.', 'Third one.']);
    speech.finish();
    expect(getReadState().status).toBe('idle');
    expect(readKey.getState(e.state)?.find()).toHaveLength(0);
  });

  test('Pause stops the voice, Resume says that sentence again, and Stop clears the mark', () => {
    const speech = fakeSpeech([LOCAL]);
    const e = mount('prose', '<p>One. Two.</p>');
    e.commands.setTextSelection(1);
    startReading(e);
    pauseReading();
    expect(getReadState().status).toBe('paused');
    resumeReading();
    expect(speech.said.map((s) => s.text)).toEqual(['One.', 'One.']);
    stopReading();
    expect(getReadState().status).toBe('idle');
    expect(e.view.dom.querySelector('.vlo-reading')).toBeNull();
  });

  test('the sentences move with an edit made while it reads', () => {
    const speech = fakeSpeech([LOCAL]);
    const e = mount('prose', '<p>One. Two.</p>');
    e.commands.setTextSelection(1);
    startReading(e);
    e.commands.insertContentAt(1, 'Well, ');
    speech.finish();
    expect(speech.said.map((s) => s.text)).toEqual(['One.', 'Two.']);
  });
});

describe('writing stats (E4)', () => {
  test('counts words, characters, blocks, sentences and times', () => {
    const stats = textStats('The sea is calm. The 🌊 rolls.\n\nA second paragraph here.', 'prose');
    expect(stats).toMatchObject({
      words: 10,
      blocks: 2,
      sentences: 3,
      readingMinutes: 1,
      speakingMinutes: 1,
    });
    expect(stats.characters).toBe('The sea is calm. The 🌊 rolls.A second paragraph here.'.length - 1);
    expect(stats.charactersNoSpaces).toBe(44);
    expect(textStats('', 'prose')).toMatchObject({ words: 0, readingMinutes: 0, blocks: 0, sentences: 0 });
    expect(textStats('one line\n\ntwo line\nthree', 'poem').blocks).toBe(3);
    expect(textStats('word '.repeat(500), 'prose')).toMatchObject({ readingMinutes: 3, speakingMinutes: 4 });
  });

  test('time labels', () => {
    expect(minutesLabel(1)).toBe('under 1 min');
    expect(minutesLabel(12)).toBe('about 12 min');
    expect(minutesLabel(60)).toBe('about 1 h');
    expect(minutesLabel(135)).toBe('about 2 h 15 min');
  });

  test('words today count from the first look each day, net of deletions, never below 0', async () => {
    let now = new Date(2026, 10, 3, 9, 0).getTime();
    const spy = vi.spyOn(clock, 'now').mockImplementation(() => now);
    try {
      await db.appMeta.delete(dayStartKey('p1'));
      expect(await wordsToday('p1', 1000)).toBe(0);
      expect(await wordsToday('p1', 1250)).toBe(250);
      expect(await wordsToday('p1', 900)).toBe(0);
      now = new Date(2026, 10, 4, 0, 5).getTime();
      expect(localDay()).toBe('2026-11-04');
      expect(await wordsToday('p1', 1300)).toBe(0);
      expect(await wordsToday('p1', 1310)).toBe(10);
    } finally {
      spy.mockRestore();
    }
    expect(cleanDayStart({ day: '2026-11-04', start: -5 })).toEqual({ day: '2026-11-04', start: 0 });
    expect(cleanDayStart({ day: 3 })).toBeNull();
  });
});
