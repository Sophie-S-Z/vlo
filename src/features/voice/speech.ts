import type { Editor } from '@tiptap/core';
import { DICTATION } from '@/features/authorship/sourcePlugin';
import { cleanLanguage, LANGUAGES } from '@/lib/language';
import type { TranscribeRequest, TranscribeResponse } from './transcribe.worker';

/*
 * Turns a recording into text on this device (roadmap F57, plan Task K9). The audio never leaves the
 * device: the main thread decodes it, and the worker runs the model.
 */

const RATE = 16_000;

/** The audio of a recording as mono samples at 16 kHz, the input of Whisper. */
async function samplesOf(audio: Blob): Promise<Float32Array> {
  // The decode gives the samples at the rate of the context.
  const decoded = await new OfflineAudioContext(1, 1, RATE).decodeAudioData(await audio.arrayBuffer());
  const out = new Float32Array(decoded.length);
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const channel = decoded.getChannelData(c);
    for (let i = 0; i < out.length; i++)
      out[i] = (out[i] ?? 0) + (channel[i] ?? 0) / decoded.numberOfChannels;
  }
  return out;
}

let worker: Worker | null = null;
let nextId = 0;
const waiting = new Map<number, { resolve: (text: string) => void; reject: (problem: Error) => void }>();

function speechWorker(): Worker {
  if (worker) return worker;
  const made = new Worker(new URL('./transcribe.worker.ts', import.meta.url), { type: 'module' });
  made.onmessage = (event: MessageEvent<TranscribeResponse>) => {
    const reply = event.data;
    const job = waiting.get(reply.id);
    waiting.delete(reply.id);
    if ('text' in reply) {
      job?.resolve(reply.text);
      return;
    }
    job?.reject(new Error(reply.error));
    // A worker whose model failed fails each later request, so the next request gets a new worker.
    made.terminate();
    if (worker === made) worker = null;
  };
  worker = made;
  return made;
}

/** The text of a recording in the project's language. A project with no language is English. */
export async function transcribe(audio: Blob, language?: string): Promise<string> {
  const samples = await samplesOf(audio);
  const base = (cleanLanguage(language) ?? 'en').split('-')[0];
  const request: TranscribeRequest = {
    id: nextId++,
    samples,
    ...(base && (LANGUAGES as readonly string[]).includes(base) ? { language: base } : {}),
  };
  return new Promise((resolve, reject) => {
    waiting.set(request.id, { resolve, reject });
    speechWorker().postMessage(request, [samples.buffer]);
  });
}

/**
 * Puts the writer's dictated words in at the cursor. The authorship record counts them as dictated, and
 * no AI mark goes on them, since they are the writer's own words.
 */
export function insertDictation(editor: Editor, text: string): boolean {
  const words = text.trim();
  if (words === '') return false;
  return editor
    .chain()
    .focus()
    .command(({ tr }) => {
      const at = tr.selection.from;
      const before = tr.doc.textBetween(Math.max(0, at - 1), at, '', ' ');
      tr.insertText(before === '' || /\s/.test(before) ? words : ` ${words}`);
      tr.setMeta(DICTATION, true);
      return true;
    })
    .run();
}
