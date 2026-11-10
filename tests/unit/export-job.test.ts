import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { DEFAULT_BOOK } from '@/features/book/book';
import type { ExportMessage, ExportResponse } from '@/features/export/export.worker';
import { ExportJob } from '@/features/export/startExport';
import { item, project } from './export-fixtures';

/* The export job sends one step at a time, in order (architecture review finding 5). */

/** A worker that keeps each message until the test answers it. */
class HeldWorker {
  static last: HeldWorker | null = null;
  onmessage: ((event: MessageEvent<ExportResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly sent: ExportMessage['type'][] = [];
  constructor() {
    HeldWorker.last = this;
  }
  postMessage(message: ExportMessage): void {
    this.sent.push(message.type);
  }
  answer(data: ExportResponse): void {
    this.onmessage?.(new MessageEvent('message', { data }));
  }
  terminate(): void {
    this.onmessage = null;
  }
}

beforeEach(() => {
  vi.stubGlobal('Worker', HeldWorker);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** Lets each waiting step post its message. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function startJob() {
  const started = ExportJob.start({
    project: project('novel'),
    items: [item('s1', 'scene', 'Scene 1')],
    scope: { kind: 'project' },
    format: 'pdf',
    people: [],
    shareSafe: false,
    text: { name: 'Letter', body: 'Dear editor,' },
  });
  await settle();
  const worker = HeldWorker.last;
  if (!worker) throw new Error('No worker.');
  worker.answer({ type: 'prepared', ownFonts: [], names: { unmarked: [], changed: [] } });
  return { job: (await started).job, worker };
}

test('a second step waits for the answer to the first, and each caller gets its own answer', async () => {
  const { job, worker } = await startJob();
  const laid = job.lay(DEFAULT_BOOK);
  const drawn = job.draw(0, 1);
  await settle();
  expect(worker.sent).toEqual(['prepare', 'lay']);

  worker.answer({ type: 'laid', pages: 12, size: [432, 648] });
  await settle();
  expect(worker.sent).toEqual(['prepare', 'lay', 'draw']);
  worker.answer({ type: 'drawn', svgs: ['<svg/>', '<svg/>'] });

  await expect(laid).resolves.toEqual({ type: 'laid', pages: 12, size: [432, 648] });
  await expect(drawn).resolves.toEqual(['<svg/>', '<svg/>']);
});

test('a failed step does not stop the next one', async () => {
  const { job, worker } = await startJob();
  const laid = job.lay(DEFAULT_BOOK);
  const drawn = job.draw(0, 0);
  await settle();
  worker.answer({ type: 'error', message: 'The book has no pages yet.' });
  await expect(laid).rejects.toThrow('The book has no pages yet.');
  await settle();
  worker.answer({ type: 'drawn', svgs: ['<svg/>'] });
  await expect(drawn).resolves.toEqual(['<svg/>']);
});

test('close stops the step on the way and each step after it', async () => {
  const { job, worker } = await startJob();
  const laid = job.lay(DEFAULT_BOOK);
  const made = job.make();
  await settle();
  job.close();
  await expect(laid).rejects.toThrow('The export stopped.');
  await expect(made).rejects.toThrow('The export stopped.');
  expect(worker.sent).toEqual(['prepare', 'lay']);
});
