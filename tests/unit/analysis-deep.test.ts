import { describe, expect, test } from 'vitest';
import { REFERENCES } from '@/features/analysis/deep/references';
import {
  forgetCalibration,
  runCalibration,
  runDeepCheck,
  savedCalibration,
  type Scorer,
} from '@/features/analysis/deep/run';
import {
  agreement,
  blocksOf,
  calibrate,
  CALIBRATION_VERSION,
  discrepancy,
  piecesOf,
  tokenStat,
  type TokenStat,
} from '@/features/analysis/deep/score';

/* The deep AI check: the Fast-DetectGPT math, the calibration and the report, with made-up models. */

/** A small seeded random source, so that each run gives the same numbers. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

function softmax(logits: readonly number[]): number[] {
  const max = Math.max(...logits);
  const e = logits.map((x) => Math.exp(x - max));
  const sum = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / sum);
}

describe('tokenStat', () => {
  test('gives the log probability and the mean and variance of the log probability', () => {
    const logits = [2, 0.5, -1, 3, 0];
    const p = softmax(logits);
    const lp = p.map(Math.log);
    const mu = p.reduce((sum, pi, i) => sum + pi * (lp[i] ?? 0), 0);
    const v = p.reduce((sum, pi, i) => sum + pi * ((lp[i] ?? 0) - mu) ** 2, 0);
    const stat = tokenStat(new Float32Array(logits), 1);
    expect(stat.lp).toBeCloseTo(lp[1] ?? 0, 5);
    expect(stat.mu).toBeCloseTo(mu, 5);
    expect(stat.v).toBeCloseTo(v, 5);
  });

  test('ignores tokens that the model rules out', () => {
    const stat = tokenStat([1, -Infinity, 1], 0);
    expect(stat.lp).toBeCloseTo(Math.log(0.5), 6);
    expect(stat.v).toBeCloseTo(1e-6, 6);
  });
});

describe('discrepancy', () => {
  const random = seeded(7);
  const steps = Array.from({ length: 3000 }, () => Array.from({ length: 30 }, () => random() * 6 - 3));
  const pick = (p: readonly number[], u: number) => {
    let total = 0;
    for (let i = 0; i < p.length; i += 1) {
      total += p[i] ?? 0;
      if (u < total) return i;
    }
    return p.length - 1;
  };

  test('is near zero for text that the model itself samples', () => {
    const stats = steps.map((logits) => tokenStat(logits, pick(softmax(logits), random())));
    expect(Math.abs(discrepancy(stats) ?? 9)).toBeLessThan(0.05);
  });

  test('is high when the text always picks the most likely token, and low for unlikely tokens', () => {
    const likely = steps.map((logits) => tokenStat(logits, logits.indexOf(Math.max(...logits))));
    const unlikely = steps.map((logits) => tokenStat(logits, logits.indexOf(Math.min(...logits))));
    expect(discrepancy(likely) ?? 0).toBeGreaterThan(0.8);
    expect(discrepancy(unlikely) ?? 0).toBeLessThan(-1.5);
  });

  test('needs enough tokens', () => {
    expect(discrepancy([{ lp: -1, mu: -2, v: 1 }])).toBeNull();
  });
});

describe('calibrate', () => {
  test('sets the cuts at the 90th and 99th percentiles of the human scores', () => {
    const c = calibrate('m', [-1, -0.5, 0, 0.5, 1], [2, 3, 0.2]);
    const sd = Math.sqrt(0.625);
    expect(c.cuts.some).toBeCloseTo(1.2816 * sd, 3);
    expect(c.cuts.many).toBeCloseTo(2.3263 * sd, 3);
    expect(c.ai.caught).toBe(2);
    expect(c.human.flagged).toBe(0);
    expect(c.useful).toBe(true);
    expect(c.version).toBe(CALIBRATION_VERSION);
  });

  test('says when the model does not separate the passages', () => {
    expect(calibrate('m', [-1, 0, 1], [0, 0.5, -0.5]).useful).toBe(false);
  });
});

describe('pieces and blocks', () => {
  test('the pieces join to the text, with the space before each sentence', () => {
    const text = 'One two three. Four five six!\n\nSeven eight nine?';
    const pieces = piecesOf(text);
    expect(pieces.map((p) => p.text).join('')).toBe(text.trimEnd());
    expect(pieces[1]?.text.startsWith(' ')).toBe(true);
  });

  test('keeps blocks under the limits, spread over the text', () => {
    expect(blocksOf([100, 100, 100], 250, 1000)).toEqual([[0, 1], [2]]);
    const blocks = blocksOf(new Array<number>(40).fill(100), 400, 1200);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]?.[0]).toBeLessThan(10);
    expect(blocks.at(-1)?.at(-1)).toBeGreaterThan(30);
    expect(blocks.flat().length * 100).toBeLessThanOrEqual(1200);
  });
});

/**
 * A made-up model: one token for each character. An upper-case letter is very predictable for it, and a
 * lower-case letter is surprising.
 */
function fakeScorer(reads: number[][] = []): Scorer {
  return {
    model: 'fake',
    label: 'Fake',
    tokenize: (text) => Array.from(text, (c) => c.charCodeAt(0)),
    read: (ids, signal, onStep) => {
      reads.push([...ids]);
      const stats: TokenStat[] = [];
      for (let i = 1; i < ids.length; i += 1) {
        if (signal.aborted) return Promise.reject(new DOMException('stop', 'AbortError'));
        const c = String.fromCharCode(ids[i] ?? 32);
        stats.push({ lp: c >= 'A' && c <= 'Z' ? -0.5 : -2.5, mu: -2, v: 1 });
        onStep();
      }
      return Promise.resolve(stats);
    },
  };
}

describe('runDeepCheck', () => {
  const human = 'The cat sat on the warm mat by the door and slept there.';
  const robot = 'THE MODEL WROTE THIS LINE WITH THE WORDS IT EXPECTED MOST.';
  const text = [...new Array<string>(8).fill(human), ...new Array<string>(8).fill(robot)].join(' ');
  const calibration = calibrate('fake', [-0.6, -0.5, -0.45, -0.55, -0.4], [1, 1.2]);

  test('marks the predictable sentences and reports the share', async () => {
    const report = await runDeepCheck(
      text,
      fakeScorer(),
      calibration,
      new AbortController().signal,
      () => undefined,
    );
    expect(report.enough).toBe(true);
    expect(report.sentences[0]?.marked).toBe(false);
    expect(report.sentences.at(-1)?.marked).toBe(true);
    expect(report.share).toBeGreaterThan(0.3);
    expect(report.share).toBeLessThan(0.8);
    expect(report.wordsRead).toBe(report.words);
    expect(['some', 'many']).toContain(report.band);
  });

  test('stops when the writer stops it', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runDeepCheck(text, fakeScorer(), calibration, controller.signal, () => undefined),
    ).rejects.toThrow('stop');
  });
});

describe('runCalibration', () => {
  test('reads every reference passage once and keeps the cuts for the model', async () => {
    const reads: number[][] = [];
    await forgetCalibration('fake');
    expect(await savedCalibration('fake')).toBeNull();
    const c = await runCalibration(fakeScorer(reads), new AbortController().signal, () => undefined);
    expect(reads).toHaveLength(REFERENCES.length);
    expect(c.human.count + c.ai.count).toBe(REFERENCES.length);
    expect(await savedCalibration('fake')).toEqual(c);
    expect(await savedCalibration('other')).toBeNull();
  });

  test('the reference set has human and AI passages of a useful length', () => {
    const human = REFERENCES.filter((r) => r.kind === 'human');
    expect(human.length).toBeGreaterThanOrEqual(15);
    expect(REFERENCES.length - human.length).toBeGreaterThanOrEqual(8);
    for (const r of REFERENCES) {
      const words = r.text.split(/\s+/).length;
      expect(words).toBeGreaterThanOrEqual(90);
      expect(words).toBeLessThanOrEqual(160);
    }
  });
});

describe('agreement', () => {
  test('says when the checks agree and when they disagree', () => {
    expect(agreement('many', 'many')).toMatch(/Both checks find many/);
    expect(agreement('few', 'many')).toMatch(/disagree/);
    expect(agreement('some', 'many')).toMatch(/One check/);
    expect(agreement('few', 'few')).toMatch(/Both checks find few/);
    expect(agreement('some', 'few')).toMatch(/some signs at most/);
  });
});
