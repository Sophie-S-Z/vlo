import { expect, test } from 'vitest';
import { MAX_CLIP_SECONDS, PAUSE_SECONDS, Segmenter, SPEECH_LEVEL } from '@/features/voice/segments';

/* Roadmap 2 F62: live dictation cuts the speech into clips at pauses, and never sends silence. */

const RATE = 1000;
const BLOCK = 50;

/** A block of 50 ms: a tone at `level`, or silence. */
const block = (level: number) => new Float32Array(BLOCK).fill(level);
const speech = block(SPEECH_LEVEL * 10);
const silence = block(0);

function feed(segmenter: Segmenter, seconds: number, part: Float32Array, busy = false) {
  for (let i = 0; i < (seconds * RATE) / BLOCK; i++) segmenter.push(part, busy);
}

function clipsOf() {
  const clips: number[] = [];
  return { clips, segmenter: new Segmenter(RATE, (clip) => clips.push(clip.length / RATE)) };
}

test('a pause after speech ends a clip, and the silence before the speech stays short', () => {
  const { clips, segmenter } = clipsOf();
  feed(segmenter, 5, silence);
  feed(segmenter, 2, speech);
  expect(clips).toEqual([]);
  feed(segmenter, PAUSE_SECONDS, silence);
  // 0.3 seconds of lead-in, 2 of speech and the pause.
  expect(clips).toEqual([2.9]);
});

test('silence and a click shorter than a word give no clip', () => {
  const { clips, segmenter } = clipsOf();
  feed(segmenter, 3, silence);
  feed(segmenter, 0.1, speech);
  feed(segmenter, 3, silence);
  segmenter.flush();
  expect(clips).toEqual([]);
});

test('while an earlier clip turns into text, a pause does not end the clip', () => {
  const { clips, segmenter } = clipsOf();
  feed(segmenter, 2, speech, true);
  feed(segmenter, 1, silence, true);
  feed(segmenter, 2, speech, true);
  expect(clips).toEqual([]);
  // The model is free again, so the next pause ends one clip with all of it.
  feed(segmenter, PAUSE_SECONDS, silence);
  expect(clips).toEqual([5.6]);
});

test('speech with no pause stops at the quietest moment of its last seconds, and nothing is lost', () => {
  const { clips, segmenter } = clipsOf();
  const quiet = block(SPEECH_LEVEL * 2);
  feed(segmenter, 20, speech);
  feed(segmenter, 0.05, quiet);
  feed(segmenter, MAX_CLIP_SECONDS, speech);
  // The quiet block is not in the last 4 seconds, so the clip ends at the limit.
  expect(clips).toEqual([MAX_CLIP_SECONDS]);
  segmenter.flush();
  expect(clips.reduce((a, b) => a + b, 0)).toBeCloseTo(20.05 + MAX_CLIP_SECONDS);

  const second = clipsOf();
  feed(second.segmenter, 26, speech);
  feed(second.segmenter, 0.05, quiet);
  feed(second.segmenter, 5, speech);
  expect(second.clips).toEqual([26.05]);
});

test('Stop gives the rest of the speech as a last clip', () => {
  const { clips, segmenter } = clipsOf();
  feed(segmenter, 1, speech);
  segmenter.flush();
  expect(clips).toEqual([1]);
  segmenter.flush();
  expect(clips).toEqual([1]);
});
