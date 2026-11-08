import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { changesFor, MODE_INFO, MODES, setAiMode } from '@/features/ai/modes';
import { ICONS, mix, SEGMENTS, toPath } from '@/features/ai/modeIcons';
import { createProject } from '@/features/library/projects';
import { db } from '@/lib/db';

/* Plan Task D2 (F23): the AI mode setting, what each change explains, and the badge icon shapes. */

beforeEach(async () => {
  await db.open();
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { persist: () => Promise.resolve(true) },
  });
});
afterEach(async () => {
  Reflect.deleteProperty(navigator, 'storage');
  await db.delete();
});

describe('setAiMode', () => {
  it('starts in Pen mode and stores each mode', async () => {
    const { project } = await createProject({ title: 'Tide', templates: ['novel'] });
    expect(project.aiMode).toBe('pen');
    await setAiMode(project.id, 'reader');
    expect((await db.projects.get(project.id))?.aiMode).toBe('reader');
    await setAiMode(project.id, 'cowriter');
    expect((await db.projects.get(project.id))?.aiMode).toBe('cowriter');
    await setAiMode(project.id, 'pen');
    expect((await db.projects.get(project.id))?.aiMode).toBe('pen');
  });

  it('refuses a project that is not on the device', async () => {
    await expect(setAiMode('nope', 'reader')).rejects.toThrow('This device has no such project.');
  });

  it('refuses a mode that Vlo does not have', async () => {
    const { project } = await createProject({ title: 'Tide', templates: ['novel'] });
    // @ts-expect-error A wrong mode from outside the types.
    await expect(setAiMode(project.id, 'robot')).rejects.toThrow(RangeError);
    expect((await db.projects.get(project.id))?.aiMode).toBe('pen');
  });
});

describe('changesFor', () => {
  it('says that Reader text never enters the manuscript, and that nothing leaves before a request', () => {
    const lines = changesFor('reader', { templates: ['novel'], aliasAiRequests: false }).join(' ');
    expect(lines).toContain('never enter your manuscript');
    expect(lines).toContain('Nothing leaves this device until you ask');
    expect(lines).not.toContain('alias');
  });

  it('says that Co-writer marks each AI word, and that a memoir sends aliases', () => {
    const lines = changesFor('cowriter', { templates: ['memoir'], aliasAiRequests: true }).join(' ');
    expect(lines).toContain('marks each AI word');
    expect(lines).toContain('aliases, never real names');
  });

  it('says that Pen mode unloads the AI code and sends nothing', () => {
    expect(changesFor('pen', { templates: ['novel'], aliasAiRequests: false }).join(' ')).toContain(
      'sends nothing',
    );
  });

  it('has a label for each mode', () => {
    expect(MODES.map((m) => MODE_INFO[m].label)).toEqual(['Pen', 'Reader', 'Co-writer']);
  });
});

describe('mode icons', () => {
  it('gives each icon the same number of points, so one can morph into another', () => {
    const lengths = MODES.map((m) => ICONS[m].length);
    expect(new Set(lengths).size).toBe(1);
    // Two closed shapes, each with a start point and SEGMENTS cubic curves of 3 points.
    expect(lengths[0]).toBe(2 * (2 + SEGMENTS * 6));
    for (const mode of MODES) {
      for (const n of ICONS[mode]) expect(n >= 0 && n <= 24).toBe(true);
    }
  });

  it('mixes two icons point by point', () => {
    expect(mix(ICONS.pen, ICONS.reader, 0)).toEqual(ICONS.pen);
    expect(mix(ICONS.pen, ICONS.reader, 1)).toEqual(ICONS.reader);
    const half = mix([0, 10], [10, 20], 0.5);
    expect(half).toEqual([5, 15]);
  });

  it('writes an SVG path with two closed shapes', () => {
    const d = toPath(ICONS.cowriter);
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d.match(/Z/g)).toHaveLength(2);
    expect(d.match(/C/g)).toHaveLength(2);
    expect(d).not.toContain('NaN');
  });
});
