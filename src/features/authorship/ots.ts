import { vloFetch } from '@/lib/net';

/*
 * The public timestamp of an authorship record (roadmap 2 F68, plan Tasks O2 and O3, decisions O1 to O3).
 * The proof is a standard OpenTimestamps file (https://opentimestamps.org), so the `ots verify` program
 * also checks it. A proof is a tree: each operation turns a message into the next one, and each leaf is
 * an attestation. A pending attestation names the calendar server that will finish it. A Bitcoin
 * attestation says that the message is the Merkle root of a block. This code reads and writes the three
 * operations that calendar servers use: SHA-256, append and prepend.
 */

export type Op = { kind: 'sha256' } | { kind: 'append' | 'prepend'; arg: Uint8Array };

export type Attestation =
  | { kind: 'pending'; uri: string }
  | { kind: 'bitcoin'; height: number }
  /** A kind that this code does not read, kept as its bytes so the proof writes back the same. */
  | { kind: 'other'; tag: Uint8Array; payload: Uint8Array };

export interface Timestamp {
  attestations: Attestation[];
  ops: { op: Op; next: Timestamp }[];
}

export interface Proof {
  /** The SHA-256 that the proof starts from: the hash of the record with no timestamp. */
  digest: Uint8Array;
  timestamp: Timestamp;
}

const MAGIC = new Uint8Array([
  0x00, 0x4f, 0x70, 0x65, 0x6e, 0x54, 0x69, 0x6d, 0x65, 0x73, 0x74, 0x61, 0x6d, 0x70, 0x73, 0x00, 0x00, 0x50,
  0x72, 0x6f, 0x6f, 0x66, 0x00, 0xbf, 0x89, 0xe2, 0xe8, 0x84, 0xe8, 0x92, 0x94,
]);
const VERSION = 1;
const SHA256 = 0x08;
const APPEND = 0xf0;
const PREPEND = 0xf1;
const ATTESTATION = 0x00;
const FORK = 0xff;
const PENDING = new Uint8Array([0x83, 0xdf, 0xe3, 0x0d, 0x2e, 0xf9, 0x0c, 0x8e]);
const BITCOIN = new Uint8Array([0x05, 0x88, 0x96, 0x0d, 0x73, 0xd7, 0x19, 0x01]);
/** The limits of the OpenTimestamps format: an argument or a message, and the depth of the tree. */
const MAX_BYTES = 4096;
const MAX_DEPTH = 256;
/** The largest answer that Vlo reads from a server. A calendar answer is a few hundred bytes. */
const MAX_ANSWER = 64 * 1024;

/** The free calendar servers that Vlo sends a hash to (decision O3). */
export const CALENDARS = ['https://a.pool.opentimestamps.org', 'https://b.pool.opentimestamps.org'];
/** The calendars that finish the proofs of the two pools. A proof that names another one stays pending. */
const FINISHERS = [
  'https://alice.btc.calendar.opentimestamps.org',
  'https://bob.btc.calendar.opentimestamps.org',
];
const BLOCKS = 'https://mempool.space/api';

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

export const hex = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

const concat = (...parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

export async function sha256(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)));
}

/** A proof that is not in the OpenTimestamps form, or that Vlo cannot read. */
export class ProofError extends Error {}

class Reader {
  private at = 0;
  constructor(private readonly bytes: Uint8Array) {}

  byte(): number {
    const value = this.bytes[this.at];
    if (value === undefined) throw new ProofError('The proof ends too soon.');
    this.at += 1;
    return value;
  }

  take(count: number): Uint8Array {
    if (this.at + count > this.bytes.length) throw new ProofError('The proof ends too soon.');
    const out = this.bytes.slice(this.at, this.at + count);
    this.at += count;
    return out;
  }

  /** An unsigned number in 7-bit groups, lowest first. */
  varuint(): number {
    let value = 0;
    for (let shift = 0; shift < 49; shift += 7) {
      const b = this.byte();
      value += (b & 0x7f) * 2 ** shift;
      if ((b & 0x80) === 0) return value;
    }
    throw new ProofError('The proof has a number that is too large.');
  }

  varbytes(max = MAX_BYTES): Uint8Array {
    const length = this.varuint();
    if (length > max) throw new ProofError('The proof has a part that is too long.');
    return this.take(length);
  }

  get done(): boolean {
    return this.at === this.bytes.length;
  }
}

class Writer {
  private readonly parts: number[] = [];

  byte(value: number): void {
    this.parts.push(value);
  }

  put(bytes: Uint8Array): void {
    for (const b of bytes) this.parts.push(b);
  }

  varuint(value: number): void {
    let rest = value;
    while (rest >= 0x80) {
      this.parts.push((rest % 0x80) | 0x80);
      rest = Math.floor(rest / 0x80);
    }
    this.parts.push(rest);
  }

  varbytes(bytes: Uint8Array): void {
    this.varuint(bytes.length);
    this.put(bytes);
  }

  bytes(): Uint8Array<ArrayBuffer> {
    return new Uint8Array(this.parts);
  }
}

function readAttestation(reader: Reader): Attestation {
  const tag = reader.take(8);
  const payload = reader.varbytes(8192);
  const inner = new Reader(payload);
  if (same(tag, PENDING)) {
    const uri = new TextDecoder().decode(inner.varbytes(1000));
    if (!/^https:\/\/[A-Za-z0-9.-]+(:\d+)?(\/[A-Za-z0-9._/-]*)?$/.test(uri))
      throw new ProofError('The proof names a calendar server with a wrong address.');
    return { kind: 'pending', uri };
  }
  if (same(tag, BITCOIN)) return { kind: 'bitcoin', height: inner.varuint() };
  return { kind: 'other', tag, payload };
}

function readOp(tag: number, reader: Reader): Op {
  if (tag === SHA256) return { kind: 'sha256' };
  if (tag === APPEND || tag === PREPEND) {
    const arg = reader.varbytes();
    if (arg.length === 0) throw new ProofError('The proof has an empty argument.');
    return { kind: tag === APPEND ? 'append' : 'prepend', arg };
  }
  throw new ProofError('The proof has an operation that Vlo does not know.');
}

function readTimestamp(reader: Reader, depth = 0): Timestamp {
  if (depth > MAX_DEPTH) throw new ProofError('The proof is too deep.');
  const timestamp: Timestamp = { attestations: [], ops: [] };
  const entry = (tag: number) => {
    if (tag === ATTESTATION) timestamp.attestations.push(readAttestation(reader));
    else {
      const op = readOp(tag, reader);
      timestamp.ops.push({ op, next: readTimestamp(reader, depth + 1) });
    }
  };
  let tag = reader.byte();
  while (tag === FORK) {
    entry(reader.byte());
    tag = reader.byte();
  }
  entry(tag);
  return timestamp;
}

function writeAttestation(writer: Writer, attestation: Attestation): void {
  writer.byte(ATTESTATION);
  const inner = new Writer();
  if (attestation.kind === 'pending') {
    writer.put(PENDING);
    inner.varbytes(new TextEncoder().encode(attestation.uri));
  } else if (attestation.kind === 'bitcoin') {
    writer.put(BITCOIN);
    inner.varuint(attestation.height);
  } else {
    writer.put(attestation.tag);
    inner.put(attestation.payload);
  }
  writer.varbytes(inner.bytes());
}

function writeTimestamp(writer: Writer, timestamp: Timestamp): void {
  const entries = [
    ...timestamp.attestations.map((a) => () => {
      writeAttestation(writer, a);
    }),
    ...timestamp.ops.map(({ op, next }) => () => {
      writer.byte(op.kind === 'sha256' ? SHA256 : op.kind === 'append' ? APPEND : PREPEND);
      if (op.kind !== 'sha256') writer.varbytes(op.arg);
      writeTimestamp(writer, next);
    }),
  ];
  if (entries.length === 0) throw new ProofError('A part of the proof is empty.');
  entries.forEach((write, i) => {
    if (i < entries.length - 1) writer.byte(FORK);
    write();
  });
}

/** Reads a whole `.ots` file: its header, the digest and the tree. */
export function readProof(bytes: Uint8Array): Proof {
  if (!same(bytes.subarray(0, MAGIC.length), MAGIC))
    throw new ProofError('This is not an OpenTimestamps proof.');
  const reader = new Reader(bytes.subarray(MAGIC.length));
  if (reader.varuint() !== VERSION) throw new ProofError('The proof has a version that Vlo does not know.');
  if (reader.byte() !== SHA256) throw new ProofError('The proof does not start from a SHA-256 hash.');
  const digest = reader.take(32);
  const timestamp = readTimestamp(reader);
  if (!reader.done) throw new ProofError('The proof has bytes after its end.');
  return { digest, timestamp };
}

export function writeProof(proof: Proof): Uint8Array<ArrayBuffer> {
  const writer = new Writer();
  writer.put(MAGIC);
  writer.varuint(VERSION);
  writer.byte(SHA256);
  writer.put(proof.digest);
  writeTimestamp(writer, proof.timestamp);
  return writer.bytes();
}

function readAnswer(bytes: Uint8Array): Timestamp {
  const reader = new Reader(bytes);
  const timestamp = readTimestamp(reader);
  if (!reader.done) throw new ProofError('The answer has bytes after its end.');
  return timestamp;
}

async function apply(op: Op, message: Uint8Array): Promise<Uint8Array> {
  const out =
    op.kind === 'sha256'
      ? await sha256(message)
      : op.kind === 'append'
        ? concat(message, op.arg)
        : concat(op.arg, message);
  if (out.length > MAX_BYTES) throw new ProofError('The proof makes a message that is too long.');
  return out;
}

/** Each attestation of the tree, with the message that it covers and the part of the tree that holds it. */
async function leaves(
  message: Uint8Array,
  timestamp: Timestamp,
): Promise<{ attestation: Attestation; message: Uint8Array; holder: Timestamp }[]> {
  const out = timestamp.attestations.map((attestation) => ({ attestation, message, holder: timestamp }));
  for (const { op, next } of timestamp.ops) out.push(...(await leaves(await apply(op, message), next)));
  return out;
}

/** Puts the entries of `from` in `into`. */
function merge(into: Timestamp, from: Timestamp): void {
  into.attestations.push(...from.attestations);
  into.ops.push(...from.ops);
}

async function answer(response: Response): Promise<Uint8Array> {
  if (!response.ok) throw new ProofError(`The server answered ${String(response.status)}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_ANSWER) throw new ProofError('The server answer is too large.');
  return bytes;
}

/**
 * Gets a timestamp for `digest` from the calendar servers. Each one gets a SHA-256 of the digest with 16
 * random bytes after it, so no server can match the hash to a record that it sees elsewhere. The proof
 * holds each answer. It throws when no server answers.
 */
export async function stamp(digest: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const nonce = crypto.getRandomValues(new Uint8Array(16));
  const message = await sha256(concat(digest, nonce));
  const answers = await Promise.allSettled(
    CALENDARS.map(async (calendar) =>
      readAnswer(await answer(await vloFetch(`${calendar}/digest`, { purpose: 'timestamp', body: message }))),
    ),
  );
  const joined: Timestamp = { attestations: [], ops: [] };
  for (const result of answers) if (result.status === 'fulfilled') merge(joined, result.value);
  if (joined.attestations.length + joined.ops.length === 0)
    throw new ProofError('No calendar server answered.');
  return writeProof({
    digest,
    timestamp: {
      attestations: [],
      ops: [
        {
          op: { kind: 'append', arg: nonce },
          next: { attestations: [], ops: [{ op: { kind: 'sha256' }, next: joined }] },
        },
      ],
    },
  });
}

export type TimestampCheck =
  /** A Bitcoin block holds the record. `finished` is the whole proof when the check finished it. */
  | { state: 'confirmed'; height: number; time: number; finished: Uint8Array | null }
  /** No Bitcoin block holds it yet. */
  | { state: 'pending' }
  | { state: 'failed'; reason: string };

/** The block hash is the double SHA-256 of the 80-byte header, with its bytes in reverse order. */
async function blockTime(height: number, root: Uint8Array): Promise<number | null> {
  const hash = (
    await answerText(await vloFetch(`${BLOCKS}/block-height/${String(height)}`, { purpose: 'timestamp' }))
  ).trim();
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new ProofError('The block server gave a wrong block hash.');
  const headerHex = (
    await answerText(await vloFetch(`${BLOCKS}/block/${hash}/header`, { purpose: 'timestamp' }))
  ).trim();
  if (!/^[0-9a-f]{160}$/.test(headerHex)) throw new ProofError('The block server gave a wrong block header.');
  const header = new Uint8Array((headerHex.match(/../g) ?? []).map((pair) => parseInt(pair, 16)));
  if (hex((await sha256(await sha256(header))).reverse()) !== hash)
    throw new ProofError('The block header does not match its hash.');
  if (!same(header.subarray(36, 68), root)) return null;
  return new DataView(header.buffer).getUint32(68, true) * 1000;
}

async function answerText(response: Response): Promise<string> {
  return new TextDecoder().decode(await answer(response));
}

/**
 * Checks the proof of a record whose hash is `digest`. A pending proof asks its calendar server for the
 * rest. A Bitcoin attestation counts only when the block header from the block server holds its message
 * as the Merkle root. The earliest block that holds the record gives the time.
 */
export async function checkTimestamp(bytes: Uint8Array, digest: Uint8Array): Promise<TimestampCheck> {
  try {
    const proof = readProof(bytes);
    if (!same(proof.digest, digest)) return { state: 'failed', reason: 'The timestamp is for another file.' };
    let all = await leaves(proof.digest, proof.timestamp);
    let finished = false;
    if (!all.some((leaf) => leaf.attestation.kind === 'bitcoin'))
      for (const { attestation, message, holder } of all) {
        if (attestation.kind !== 'pending' || !FINISHERS.includes(attestation.uri)) continue;
        try {
          const rest = readAnswer(
            await answer(
              await vloFetch(`${attestation.uri}/timestamp/${hex(message)}`, { purpose: 'timestamp' }),
            ),
          );
          holder.attestations = holder.attestations.filter((a) => a !== attestation);
          merge(holder, rest);
          finished = true;
        } catch {
          // The calendar has not finished this one yet, or it did not answer.
        }
      }
    if (finished) all = await leaves(proof.digest, proof.timestamp);
    const blocks = all
      .flatMap(({ attestation, message }) =>
        attestation.kind === 'bitcoin' ? [{ height: attestation.height, message }] : [],
      )
      .sort((a, b) => a.height - b.height);
    for (const { height, message } of blocks) {
      const time = await blockTime(height, message);
      if (time !== null)
        return { state: 'confirmed', height, time, finished: finished ? writeProof(proof) : null };
    }
    return blocks.length > 0
      ? { state: 'failed', reason: 'No Bitcoin block holds this timestamp.' }
      : { state: 'pending' };
  } catch (problem) {
    if (problem instanceof ProofError) return { state: 'failed', reason: problem.message };
    return { state: 'failed', reason: 'Vlo could not reach the servers. Try again later.' };
  }
}
