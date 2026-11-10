import { Editor } from '@tiptap/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as Y from 'yjs';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { proseExtensions } from '@/features/editor/extensions/prose';

/* Roadmap 2 F62, plan Task M1: Speak to write. A fake recorder and a fake model stand in for the device. */

const fake = vi.hoisted(() => ({ ready: true, text: 'We left at dawn.', stops: 0, cancels: 0 }));

vi.mock('@/features/voice/recorder', () => ({
  startRecording: () =>
    Promise.resolve({
      level: () => 0.5,
      stop: () => {
        fake.stops += 1;
        return Promise.resolve(new Blob(['audio'], { type: 'audio/webm' }));
      },
      cancel: () => {
        fake.cancels += 1;
      },
    }),
}));
vi.mock('@/features/voice/model', () => ({
  MODEL_SIZE: '80 MB',
  modelReady: () => Promise.resolve(fake.ready),
  downloadModel: () => Promise.resolve(),
}));
vi.mock('@/features/voice/speech', async (original) => ({
  ...(await original<typeof import('@/features/voice/speech')>()),
  transcribe: () => Promise.resolve(fake.text),
}));

const { MAX_SECONDS, SpeakPanel } = await import('@/features/voice/SpeakPanel');

let editor: Editor;
let now = 0;
let frames: FrameRequestCallback[] = [];

beforeEach(() => {
  Object.assign(fake, { ready: true, text: 'We left at dawn.', stops: 0, cancels: 0 });
  now = 0;
  frames = [];
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  const host = document.createElement('div');
  document.body.append(host);
  editor = new Editor({ element: host, extensions: proseExtensions(new Y.Doc()) });
  editor.commands.insertContent('It began.');
  editor.view.focus();
});
afterEach(() => {
  cleanup();
  editor.destroy();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

/** Moves the clock and runs the frames that wait. */
function tick(seconds: number) {
  now += seconds * 1000;
  const waiting = frames;
  frames = [];
  act(() => {
    for (const frame of waiting) frame(now);
  });
}

test('the words go in at the cursor, and the panel closes', async () => {
  const done = vi.fn();
  render(<SpeakPanel editor={editor} language="en-GB" onDone={done} />);
  fireEvent.click(screen.getByRole('button', { name: 'Speak' }));
  await screen.findByRole('button', { name: 'Stop and write' });
  tick(2);
  expect(screen.getByText('Listening, 0:02 of 0:30')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Stop and write' }));
  await vi.waitFor(() => {
    expect(done).toHaveBeenCalledOnce();
  });
  expect(editor.getText()).toBe('It began. We left at dawn.');
  expect(fake.stops).toBe(1);
});

test(`a clip stops by itself at ${String(MAX_SECONDS)} seconds, one time`, async () => {
  const done = vi.fn();
  render(<SpeakPanel editor={editor} language={undefined} onDone={done} />);
  fireEvent.click(screen.getByRole('button', { name: 'Speak' }));
  await screen.findByRole('button', { name: 'Stop and write' });
  tick(MAX_SECONDS);
  tick(0.1);
  await vi.waitFor(() => {
    expect(done).toHaveBeenCalledOnce();
  });
  expect(fake.stops).toBe(1);
});

test('the first use asks before the model downloads, and Cancel puts nothing in', async () => {
  fake.ready = false;
  const done = vi.fn();
  render(<SpeakPanel editor={editor} language={undefined} onDone={done} />);
  fireEvent.click(screen.getByRole('button', { name: 'Speak' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Stop and write' }));
  const ask = await screen.findByRole('region', { name: 'Download the speech model' });
  expect(ask.textContent).toContain('Whisper base model once (80 MB)');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('region', { name: 'Download the speech model' })).toBeNull();
  expect(editor.getText()).toBe('It began.');
  expect(done).not.toHaveBeenCalled();
});

test('a panel that closes during a recording drops the audio', async () => {
  const { unmount } = render(<SpeakPanel editor={editor} language={undefined} onDone={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Speak' }));
  await screen.findByRole('button', { name: 'Stop and write' });
  unmount();
  expect(fake.cancels).toBe(1);
  expect(fake.stops).toBe(0);
});

test('no words in the clip gives a message and changes nothing', async () => {
  fake.text = '';
  render(<SpeakPanel editor={editor} language={undefined} onDone={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Speak' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Stop and write' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Vlo found no words in this recording.');
  expect(editor.getText()).toBe('It began.');
});
