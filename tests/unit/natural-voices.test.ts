import { Editor } from '@tiptap/core';
import * as Y from 'yjs';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { proseExtensions } from '@/features/editor/extensions/prose';
import {
  NATURAL_DEFAULT,
  naturalLanguage,
  naturalUri,
  naturalVoiceOf,
  speechParts,
  VOICE_CACHE,
  VOICE_IDS,
  voiceName,
} from '@/features/voice/natural';
import type { SpeakResponse } from '@/features/voice/speak.worker';

/* Read aloud with the natural voices: the voice list, long sentences, the worker and the reader. */

const fake = vi.hoisted(() => ({
  asked: [] as { text: string; voice: string; speed: number; language: string }[],
  /** Ends the sentence that plays now. */
  end: null as (() => void) | null,
  played: [] as string[],
  stops: 0,
  forgets: 0,
}));

vi.mock('@/features/voice/naturalSpeech', () => ({
  naturalAudio: (text: string, voice: string, speed: number, language: string) => {
    fake.asked.push({ text, voice, speed, language });
    return Promise.resolve({ samples: new Float32Array([text.length]), rate: 44_100 });
  },
  playAudio: (audio: { samples: Float32Array }, onEnd: () => void) => {
    fake.played.push(String(audio.samples[0]));
    fake.end = onEnd;
  },
  stopAudio: () => {
    fake.stops += 1;
    fake.end = null;
  },
  forgetAudio: () => {
    fake.forgets += 1;
  },
  unlockAudio: () => undefined,
}));

const {
  getReadState,
  pauseReading,
  ReadAloudMark,
  resumeReading,
  setReadSettings,
  startReading,
  stopReading,
} = await import('@/features/editor/readAloud/reader');

describe('the voice list', () => {
  test('ten voices, five female and five male, each with a URI of its own', () => {
    expect(VOICE_IDS.map(voiceName)).toEqual([
      'Female voice 1',
      'Female voice 2',
      'Female voice 3',
      'Female voice 4',
      'Female voice 5',
      'Male voice 1',
      'Male voice 2',
      'Male voice 3',
      'Male voice 4',
      'Male voice 5',
    ]);
    expect(naturalVoiceOf(naturalUri('M3'))).toBe('M3');
    expect(naturalVoiceOf(NATURAL_DEFAULT)).toBe('F1');
    expect(naturalVoiceOf('vlo-natural:X9')).toBeNull();
    expect(naturalVoiceOf('com.apple.voice.Moira')).toBeNull();
    expect(naturalVoiceOf(null)).toBeNull();
  });

  test('the natural voices speak English, Spanish, French, Portuguese and Korean', () => {
    expect(naturalLanguage(undefined)).toBe('en');
    expect(naturalLanguage('en-GB')).toBe('en');
    expect(naturalLanguage('pt-BR')).toBe('pt');
    expect(naturalLanguage('ko')).toBe('ko');
    expect(naturalLanguage('de')).toBeNull();
  });

  test('a long sentence goes in parts at a comma, else at a space, and keeps every word', () => {
    expect(speechParts('Short.')).toEqual(['Short.']);
    const long = `${'word '.repeat(40).trim()}, ${'more '.repeat(30).trim()}.`;
    const parts = speechParts(long, 300);
    expect(parts).toHaveLength(2);
    expect(parts[0]?.endsWith('word,')).toBe(true);
    const spaces = speechParts('a '.repeat(400), 300);
    for (const part of spaces) expect(part.length).toBeLessThanOrEqual(300);
    expect(spaces.join(' ')).toBe('a '.repeat(400).trim());
    expect(speechParts('x'.repeat(650), 300).map((p) => p.length)).toEqual([300, 300, 50]);
  });
});

describe('the voice worker', () => {
  afterEach(() => {
    vi.doUnmock('@huggingface/transformers');
    vi.unstubAllGlobals();
  });

  test('it reads the voice from the cache only, tags the language, and joins the parts of a long sentence', async () => {
    vi.resetModules();
    const env = { backends: { onnx: { wasm: {} } } };
    const tts = vi.fn<(text: string, options: unknown) => Promise<unknown>>((text) =>
      Promise.resolve({ data: new Float32Array(text.length), sampling_rate: 100 }),
    );
    const pipeline = vi.fn(() => Promise.resolve(tts));
    vi.doMock('@huggingface/transformers', () => ({ env, pipeline }));
    const matched: string[] = [];
    vi.stubGlobal('caches', {
      open: () =>
        Promise.resolve({
          match: (key: string) => {
            matched.push(key);
            return Promise.resolve(new Response(new Float32Array([1, 2]).buffer));
          },
        }),
    });
    const replies: SpeakResponse[] = [];
    vi.spyOn(self, 'postMessage').mockImplementation((reply: unknown) => {
      replies.push(reply as SpeakResponse);
    });
    await import('@/features/voice/speak.worker');
    expect(env).toMatchObject({ allowLocalModels: false, useBrowserCache: true, cacheKey: VOICE_CACHE });

    const long = `${'word '.repeat(50).trim()}, ${'then '.repeat(15)}the end`;
    const send = (data: unknown) => {
      self.onmessage?.(new MessageEvent('message', { data }));
    };
    send({ type: 'speak', id: 1, text: 'The tide rose', voice: 'M2', speed: 1.05, language: 'en' });
    send({ type: 'speak', id: 2, text: long, voice: 'M2', speed: 1.05, language: 'fr' });
    await vi.waitFor(() => {
      expect(replies).toHaveLength(2);
    });
    // The reading stops while the third sentence waits.
    send({ type: 'speak', id: 3, text: 'Never said.', voice: 'F1', speed: 1, language: 'en' });
    send({ type: 'skip', below: 4 });
    await vi.waitFor(() => {
      expect(replies).toHaveLength(3);
    });
    expect(pipeline).toHaveBeenCalledWith('text-to-speech', 'onnx-community/Supertonic-TTS-2-ONNX', {
      dtype: 'fp32',
      device: 'wasm',
    });
    // A part with no stop at its end gets one.
    expect(tts.mock.calls.map(([text]) => text)).toEqual([
      '<en>The tide rose.</en>',
      `<fr>${'word '.repeat(50).trim()},</fr>`,
      `<fr>${'then '.repeat(15)}the end.</fr>`,
    ]);
    expect(tts.mock.calls[0]?.[1]).toMatchObject({ speed: 1.05, num_inference_steps: 8 });
    expect(matched).toEqual([
      'https://huggingface.co/onnx-community/Supertonic-TTS-2-ONNX/resolve/main/voices/M2.bin',
    ]);
    const [first, second, third] = replies;
    expect(first).toMatchObject({ id: 1, rate: 100 });
    // The two parts with 0.15 seconds of silence between them.
    const parts = tts.mock.calls.slice(1).map(([text]) => text.length);
    expect(second && 'samples' in second ? second.samples.length : 0).toBe(
      (parts[0] ?? 0) + 15 + (parts[1] ?? 0),
    );
    // The worker made no audio for the third sentence.
    expect(third).toEqual({ id: 3, error: 'Skipped.' });
  });
});

describe('read aloud with a natural voice', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = () => undefined;
  });
  let editor: Editor;
  beforeEach(() => {
    localStorage.clear();
    Object.assign(fake, { asked: [], end: null, played: [], stops: 0, forgets: 0 });
    const host = document.createElement('div');
    document.body.append(host);
    editor = new Editor({ element: host, extensions: [...proseExtensions(new Y.Doc()), ReadAloudMark] });
    editor.commands.setContent('<p>One. Two two. Three three three.</p><p>Four four four four.</p>');
    editor.commands.setTextSelection(1);
  });
  afterEach(() => {
    stopReading();
    editor.destroy();
    document.body.replaceChildren();
  });

  /** Lets the audio promises settle. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  test('the default voice reads each sentence in turn, with the next two made in advance', async () => {
    startReading(editor);
    await settle();
    expect(fake.asked.map((a) => a.text)).toEqual(['One.', 'Two two.', 'Three three three.']);
    expect(fake.asked[0]).toEqual({ text: 'One.', voice: 'F1', speed: 1.05, language: 'en' });
    expect(fake.played).toEqual(['4']);
    expect(editor.view.dom.querySelector('.vlo-reading')?.textContent).toBe('One.');

    fake.end?.();
    await settle();
    expect(fake.played).toEqual(['4', '8']);
    expect(fake.asked.map((a) => a.text)).toContain('Four four four four.');
    fake.end?.();
    await settle();
    fake.end?.();
    await settle();
    fake.end?.();
    await settle();
    // There is no limit: Vlo reads to the end, then stops by itself.
    expect(fake.played).toEqual(['4', '8', '18', '20']);
    expect(getReadState().status).toBe('idle');
    // Each sentence was made once.
    expect(fake.asked).toHaveLength(4);
  });

  test('Pause stops the audio, and Resume plays that sentence again with no new audio', async () => {
    setReadSettings({ voice: naturalUri('M1'), rate: 2 });
    startReading(editor);
    await settle();
    // The natural voices read at most 1.4 times their pace.
    expect(fake.asked[0]).toMatchObject({ voice: 'M1', speed: 1.47 });
    pauseReading();
    expect(getReadState().status).toBe('paused');
    expect(fake.stops).toBeGreaterThan(0);
    resumeReading();
    await settle();
    expect(fake.played).toEqual(['4', '4']);
    expect(fake.asked).toHaveLength(3);
    stopReading();
    expect(fake.forgets).toBeGreaterThan(0);
    expect(editor.view.dom.querySelector('.vlo-reading')).toBeNull();
  });

  test('in a language that the natural voices do not speak, the device voice reads', () => {
    const said: string[] = [];
    vi.stubGlobal('speechSynthesis', {
      getVoices: () => [{ voiceURI: 'anna', name: 'Anna', lang: 'de-DE', localService: true, default: true }],
      speak: (u: { text: string }) => said.push(u.text),
      cancel: () => undefined,
    });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        constructor(public text: string) {}
      },
    );
    startReading(editor, undefined, 'de');
    expect(fake.asked).toEqual([]);
    expect(said).toEqual(['One.']);
    vi.unstubAllGlobals();
  });
});
