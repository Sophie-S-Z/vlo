import { Editor } from '@tiptap/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as Y from 'yjs';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { proseExtensions } from '@/features/editor/extensions/prose';

/*
 * Roadmap 2 F62, plan Task M1: Speak to write, with live dictation. A fake microphone and a fake model
 * stand in for the device. segments.test.ts holds the pauses that cut the clips.
 */

const fake = vi.hoisted(() => ({
  ready: new Map<string, boolean>(),
  downloads: [] as string[],
  texts: [] as string[],
  models: [] as string[],
  write: null as ((samples: Float32Array) => Promise<void>) | null,
  clips: [] as Promise<void>[],
  stops: 0,
}));

vi.mock('@/features/voice/listen', () => ({
  startListening: (write: (samples: Float32Array) => Promise<void>) => {
    fake.write = write;
    return Promise.resolve({
      level: () => 0.5,
      // As the real one does, Stop waits for the clips and fails when one failed.
      stop: async () => {
        fake.stops += 1;
        await Promise.all(fake.clips);
      },
    });
  },
}));
vi.mock('@/features/voice/model', async (original) => ({
  ...(await original<typeof import('@/features/voice/model')>()),
  modelReady: (id: string) => Promise.resolve(fake.ready.get(id) === true),
  downloadModel: (id: string) => {
    fake.downloads.push(id);
    fake.ready.set(id, true);
    return Promise.resolve();
  },
}));
vi.mock('@/features/voice/speech', async (original) => ({
  ...(await original<typeof import('@/features/voice/speech')>()),
  transcribe: (_audio: unknown, model: string) => {
    fake.models.push(model);
    const text = fake.texts.shift();
    return text === undefined ? Promise.reject(new Error('The model failed.')) : Promise.resolve(text);
  },
}));

const { SpeakPanel } = await import('@/features/voice/SpeakPanel');

let editor: Editor;

beforeEach(() => {
  localStorage.clear();
  Object.assign(fake, {
    ready: new Map([['small', true]]),
    downloads: [],
    texts: [],
    models: [],
    write: null,
    clips: [],
    stops: 0,
  });
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  const host = document.createElement('div');
  document.body.append(host);
  editor = new Editor({ element: host, extensions: proseExtensions(new Y.Doc()) });
  editor.commands.insertContent('It began.');
});
afterEach(() => {
  cleanup();
  editor.destroy();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

/** A clip that the microphone heard, with the words that the fake model gives for it. */
async function hear(text: string) {
  fake.texts.push(text);
  const write = fake.write;
  if (!write) throw new Error('Vlo is not listening.');
  const clip = write(new Float32Array(16_000));
  fake.clips.push(clip);
  await act(() => clip.catch(() => undefined));
}

test('the words of each clip go in at the cursor while the writer speaks, and Stop closes the panel', async () => {
  const done = vi.fn();
  render(<SpeakPanel editor={editor} language="en-GB" onDone={done} />);
  fireEvent.click(screen.getByRole('button', { name: 'Speak' }));
  await screen.findByRole('button', { name: 'Stop' });
  expect(screen.getByText('Listening').getAttribute('role')).toBe('status');

  await hear('We left at dawn.');
  expect(editor.getText()).toBe('It began. We left at dawn.');
  await hear(' The road was empty. ');
  expect(editor.getText()).toBe('It began. We left at dawn. The road was empty.');
  // The panel stays open, and nothing has closed it yet.
  expect(done).not.toHaveBeenCalled();
  expect(fake.models).toEqual(['small', 'small']);

  fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
  await vi.waitFor(() => {
    expect(done).toHaveBeenCalledOnce();
  });
  expect(fake.stops).toBe(1);
});

test('the first use asks before any download or listening, and Cancel changes nothing', async () => {
  fake.ready.set('small', false);
  const done = vi.fn();
  render(<SpeakPanel editor={editor} language={undefined} onDone={done} />);
  fireEvent.click(screen.getByRole('button', { name: 'Speak' }));
  const ask = await screen.findByRole('region', { name: 'Download the speech model' });
  expect(ask.textContent).toContain('Whisper small (252 MB) makes the fewest mistakes.');
  expect(ask.textContent).toContain('Whisper base (80 MB) is faster');
  expect(fake.write).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('region', { name: 'Download the speech model' })).toBeNull();
  expect(fake.downloads).toEqual([]);
  expect(editor.getText()).toBe('It began.');
  expect(done).not.toHaveBeenCalled();
});

test('the fast model downloads after the writer picks it, becomes the choice, and Vlo listens', async () => {
  fake.ready.set('small', false);
  render(<SpeakPanel editor={editor} language={undefined} onDone={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Speak' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Download the fast model (80 MB)' }));
  await screen.findByRole('button', { name: 'Stop' });
  expect(fake.downloads).toEqual(['base']);
  expect(localStorage.getItem('vlo:speechModel')).toBe('base');
  await hear('Salt on the glass.');
  expect(fake.models).toEqual(['base']);
});

test('a panel that closes while Vlo listens still writes the last words', async () => {
  const done = vi.fn();
  const { unmount } = render(<SpeakPanel editor={editor} language={undefined} onDone={done} />);
  fireEvent.click(screen.getByRole('button', { name: 'Speak' }));
  await screen.findByRole('button', { name: 'Stop' });
  fake.texts.push('The last line.');
  const last = fake.write?.(new Float32Array(16_000));
  if (last) fake.clips.push(last);
  unmount();
  await last;
  expect(fake.stops).toBe(1);
  expect(editor.getText()).toBe('It began. The last line.');
  // The panel is gone, so nothing closes it again.
  expect(done).not.toHaveBeenCalled();
});

test('a model that fails stops the listening and says so', async () => {
  render(<SpeakPanel editor={editor} language={undefined} onDone={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Speak' }));
  await screen.findByRole('button', { name: 'Stop' });
  // No text waits, so the fake model fails.
  const write = fake.write;
  if (!write) throw new Error('Vlo is not listening.');
  const clip = write(new Float32Array(16_000));
  fake.clips.push(clip);
  await act(() => clip.catch(() => undefined));
  expect((await screen.findByRole('alert')).textContent).toMatch(/could not turn your speech into text/);
  expect(screen.getByRole('button', { name: 'Speak' })).toBeTruthy();
  expect(editor.getText()).toBe('It began.');
});
