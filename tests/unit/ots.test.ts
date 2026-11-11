import { readFileSync } from 'node:fs';
import { Editor } from '@tiptap/core';
import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { resetSigningKey } from '@/features/authorship/keys';
import {
  checkTimestamp,
  hex,
  readProof,
  sha256,
  writeProof,
  type Timestamp,
} from '@/features/authorship/ots';
import { exportRecord, flushEntry, resetPending, stampRecord } from '@/features/authorship/record';
import { AuthorshipCount } from '@/features/authorship/sourcePlugin';
import { verifyRecord, withTimestamp } from '@/features/authorship/verify';
import { proseExtensions } from '@/features/editor/extensions/prose';
import { db } from '@/lib/db';

/* Roadmap 2 F68, plan Tasks O2 and O3, Review Focus 1 and 2: the public timestamp of a record. */

/** Two answers that the calendar servers gave in November 2026, for one hash. */
const ANSWERS = {
  'a.pool.opentimestamps.org': readFileSync('tests/fixtures/ots/a-pool-answer.bin'),
  'b.pool.opentimestamps.org': readFileSync('tests/fixtures/ots/b-pool-answer.bin'),
};
const BITCOIN = [0x05, 0x88, 0x96, 0x0d, 0x73, 0xd7, 0x19, 0x01];
const HEIGHT = 920_000;
const TIME = Date.UTC(2026, 10, 11, 14, 5, 0);

/** A server for each request: the path of each request, and a function that answers it. */
function servers(answer: (url: URL, body: Uint8Array | null) => Response) {
  const calls: { url: URL; body: Uint8Array | null }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: URL, init?: RequestInit) => {
      const body = init?.body instanceof Uint8Array ? init.body : null;
      calls.push({ url: input, body });
      return Promise.resolve(answer(input, body));
    }),
  );
  return calls;
}

/** A block header whose Merkle root is `root`, and its block hash as a block server shows it. */
async function block(root: Uint8Array) {
  const header = new Uint8Array(80);
  header.set(root, 36);
  new DataView(header.buffer).setUint32(68, TIME / 1000, true);
  const hash = hex((await sha256(await sha256(header))).reverse());
  return { header: hex(header), hash };
}

/** The bytes of a timestamp that a finishing calendar gives: SHA-256, then the Bitcoin block. */
const finishedAnswer = () => new Uint8Array([0x08, 0x00, ...BITCOIN, 0x03, 0xc0, 0x93, 0x38]);

function blockServer(found: { header: string; hash: string }) {
  return (url: URL) => {
    if (url.pathname === `/api/block-height/${String(HEIGHT)}`) return new Response(found.hash);
    if (url.pathname === `/api/block/${found.hash}/header`) return new Response(found.header);
    return new Response('', { status: 404 });
  };
}

const editors: Editor[] = [];
beforeEach(async () => {
  await db.open();
});
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const e of editors.splice(0)) e.destroy();
  resetPending();
  resetSigningKey();
  await db.delete();
});

async function record(): Promise<string> {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: [...proseExtensions(new Y.Doc()), AuthorshipCount.configure({ projectId: 'p1' })],
  });
  editors.push(editor);
  editor.view.dispatch(editor.state.tr.insertText('Mira rows.', 1));
  await flushEntry('p1');
  return (await exportRecord('p1')) ?? '';
}

describe('a proof in the OpenTimestamps form', () => {
  test('the height 920,000 writes as the varuint c0 93 38', () => {
    expect(HEIGHT).toBe(0x40 + 0x13 * 0x80 + 0x38 * 0x4000);
  });

  test('reads and writes back to the same bytes, with the answers of both calendar servers', async () => {
    servers((url) => new Response(ANSWERS[url.host as keyof typeof ANSWERS]));
    const file = await stampRecord(await record());
    const proof = Uint8Array.from(atob((JSON.parse(file) as { timestamp: string }).timestamp), (c) =>
      c.charCodeAt(0),
    );
    expect(writeProof(readProof(proof))).toEqual(proof);
    const pending: string[] = [];
    const walk = (t: Timestamp) => {
      for (const a of t.attestations) if (a.kind === 'pending') pending.push(a.uri);
      for (const { next } of t.ops) walk(next);
    };
    walk(readProof(proof).timestamp);
    expect(pending.sort()).toEqual([
      'https://alice.btc.calendar.opentimestamps.org',
      'https://bob.btc.calendar.opentimestamps.org',
    ]);
  });

  test('refuses bytes that are not a proof, a cut proof and an operation that it does not know', () => {
    expect(() => readProof(new Uint8Array([1, 2, 3]))).toThrow('not an OpenTimestamps proof');
    const good = writeProof({
      digest: new Uint8Array(32),
      timestamp: { attestations: [{ kind: 'bitcoin', height: 1 }], ops: [] },
    });
    expect(() => readProof(good.slice(0, -1))).toThrow('ends too soon');
    const keccak = good.slice();
    keccak[good.length - 11] = 0x67;
    expect(() => readProof(keccak)).toThrow();
  });
});

describe('Get a public timestamp', () => {
  test('each server gets one 32-byte hash that is not the hash of the record, and the log shows both', async () => {
    const calls = servers((url) => new Response(ANSWERS[url.host as keyof typeof ANSWERS]));
    const plain = await record();
    const file = await stampRecord(plain);
    expect(calls.map((c) => `${c.url.host}${c.url.pathname}`).sort()).toEqual([
      'a.pool.opentimestamps.org/digest',
      'b.pool.opentimestamps.org/digest',
    ]);
    const digest = await sha256(new TextEncoder().encode(plain));
    for (const { body } of calls) {
      expect(body).toHaveLength(32);
      expect(hex(body ?? new Uint8Array())).not.toBe(hex(digest));
    }
    expect((await db.networkLog.toArray()).map((e) => [e.purpose, e.bytesSent])).toEqual([
      ['timestamp', 32],
      ['timestamp', 32],
    ]);
    // The record keeps each byte, and the proof is its last field.
    expect(file.startsWith(plain.slice(0, -1))).toBe(true);
    expect(await verifyRecord(file)).toMatchObject({ ok: true, timestamp: { digest } });
  });

  test('one server is enough, and with none the call throws so the record downloads with no proof', async () => {
    servers((url) =>
      url.host.startsWith('a.')
        ? new Response(ANSWERS[url.host as keyof typeof ANSWERS])
        : new Response('', { status: 503 }),
    );
    expect(await verifyRecord(await stampRecord(await record()))).toMatchObject({ ok: true });
    servers(() => new Response('', { status: 503 }));
    await expect(stampRecord((await exportRecord('p1')) ?? '')).rejects.toThrow(
      'No calendar server answered',
    );
  });

  test('a record with no timestamp is the same file as before, and a changed proof or digest fails', async () => {
    servers((url) => new Response(ANSWERS[url.host as keyof typeof ANSWERS]));
    const plain = await record();
    expect(plain).not.toContain('timestamp');
    expect(await verifyRecord(plain)).toMatchObject({ ok: true, timestamp: null });
    const file = await stampRecord(plain);
    const other = writeProof({
      digest: new Uint8Array(32),
      timestamp: { attestations: [{ kind: 'bitcoin', height: 1 }], ops: [] },
    });
    expect(await verifyRecord(withTimestamp(file, other))).toMatchObject({
      ok: false,
      reason: 'The public timestamp of this record is for another file.',
    });
    expect(await verifyRecord(file.replace(/"timestamp":"./, '"timestamp":"!'))).toMatchObject({
      ok: false,
      reason: 'The public timestamp of this record is not a proof that Vlo can read.',
    });
  });
});

describe('Check the timestamp', () => {
  const digest = new Uint8Array(32).fill(7);

  test('a Bitcoin proof gives the block time when the block header holds its message', async () => {
    const proof = writeProof({
      digest,
      timestamp: {
        attestations: [],
        ops: [
          { op: { kind: 'sha256' }, next: { attestations: [{ kind: 'bitcoin', height: HEIGHT }], ops: [] } },
        ],
      },
    });
    const found = await block(await sha256(digest));
    const calls = servers(blockServer(found));
    expect(await checkTimestamp(proof, digest)).toEqual({
      state: 'confirmed',
      height: HEIGHT,
      time: TIME,
      finished: null,
    });
    expect(calls.map((c) => c.url.host)).toEqual(['mempool.space', 'mempool.space']);
  });

  test('a wrong Merkle root, a header that does not match its hash and another digest show no date', async () => {
    const proof = writeProof({
      digest,
      timestamp: { attestations: [{ kind: 'bitcoin', height: HEIGHT }], ops: [] },
    });
    servers(blockServer(await block(new Uint8Array(32).fill(1))));
    expect(await checkTimestamp(proof, digest)).toEqual({
      state: 'failed',
      reason: 'No Bitcoin block holds this timestamp.',
    });
    const found = await block(digest);
    servers(blockServer({ ...found, header: `ff${found.header.slice(2)}` }));
    expect(await checkTimestamp(proof, digest)).toEqual({
      state: 'failed',
      reason: 'The block header does not match its hash.',
    });
    expect(await checkTimestamp(proof, new Uint8Array(32))).toEqual({
      state: 'failed',
      reason: 'The timestamp is for another file.',
    });
  });

  test('a pending proof asks its calendar, stays pending until it is ready, then gives the finished proof', async () => {
    const proof = writeProof({
      digest,
      timestamp: {
        attestations: [{ kind: 'pending', uri: 'https://alice.btc.calendar.opentimestamps.org' }],
        ops: [],
      },
    });
    const calls = servers(() => new Response('', { status: 404 }));
    expect(await checkTimestamp(proof, digest)).toEqual({ state: 'pending' });
    expect(calls.map((c) => `${c.url.host}${c.url.pathname}`)).toEqual([
      `alice.btc.calendar.opentimestamps.org/timestamp/${hex(digest)}`,
    ]);

    const found = await block(await sha256(digest));
    servers((url) =>
      url.host.startsWith('alice.') ? new Response(finishedAnswer()) : blockServer(found)(url),
    );
    const check = await checkTimestamp(proof, digest);
    expect(check).toMatchObject({ state: 'confirmed', height: HEIGHT, time: TIME });
    const finished = check.state === 'confirmed' ? check.finished : null;
    expect(readProof(finished ?? new Uint8Array()).timestamp.attestations).toEqual([]);
  });

  test('a proof that names another calendar server stays pending and sends nothing', async () => {
    const proof = writeProof({
      digest,
      timestamp: { attestations: [{ kind: 'pending', uri: 'https://calendar.example.org' }], ops: [] },
    });
    const calls = servers(() => new Response(''));
    expect(await checkTimestamp(proof, digest)).toEqual({ state: 'pending' });
    expect(calls).toEqual([]);
  });
});
