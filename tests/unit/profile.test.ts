import { describe, expect, it } from 'vitest';
import { clampCrop, cropSide, MAX_ZOOM } from '@/features/account/photo';
import {
  byline,
  cleanProfile,
  greetingName,
  initials,
  keepProfile,
  profileProblem,
  readProfile,
  type Profile,
} from '@/features/account/profile';
import { createProject } from '@/features/library/projects';
import { db } from '@/lib/db';

/* ADR 0011: the writer's profile, the greeting, the byline and the photo square. */

const ADA: Profile = { name: 'Ada King Lovelace', called: '', penName: '', bio: '', photo: null };

describe('the profile', () => {
  it('greets with the chosen name, else the first word of the full name', () => {
    expect(greetingName(ADA)).toBe('Ada');
    expect(greetingName({ ...ADA, called: ' Countess ' })).toBe('Countess');
    expect(greetingName({ name: '  ', called: '' })).toBe('');
  });

  it('signs new work with the pen name, else the full name', () => {
    expect(byline(ADA)).toBe('Ada King Lovelace');
    expect(byline({ ...ADA, penName: 'A. A. L.' })).toBe('A. A. L.');
  });

  it('takes the initials of the first and last words, in any script', () => {
    expect(initials('Ada King Lovelace')).toBe('AL');
    expect(initials('mira')).toBe('M');
    expect(initials('émile zola')).toBe('ÉZ');
    expect(initials('')).toBe('');
  });

  it('cleans the text as the server keeps it, and names the first problem', () => {
    expect(cleanProfile({ ...ADA, name: ' Ada\u0007 ', bio: 'One.\r\nTwo.\tThree. ' })).toMatchObject({
      name: 'Ada',
      bio: 'One.\nTwo. Three.',
    });
    expect(profileProblem({ ...ADA, name: '   ' })).toBe('Type your name.');
    expect(profileProblem({ ...ADA, bio: 'x'.repeat(1001) })).toMatch(/1000 characters/);
    expect(profileProblem({ ...ADA, photo: 'x'.repeat(60_001) })).toMatch(/too large/);
    expect(profileProblem(ADA)).toBe('');
  });

  it('keeps a copy on the device, and new projects take its byline as their author', async () => {
    await db.open();
    try {
      expect(await readProfile()).toBeNull();
      expect(
        (await createProject({ title: 'Before', templates: ['novel'] })).project.authorName,
      ).toBeUndefined();
      await keepProfile({ ...ADA, penName: 'A. L.' });
      expect(await readProfile()).toMatchObject({ penName: 'A. L.' });
      const { project } = await createProject({ title: 'Engines', templates: ['novel'] });
      expect(project.authorName).toBe('A. L.');
      const named = await createProject({ title: 'Notes', templates: ['open'], authorName: 'Menabrea' });
      expect(named.project.authorName).toBe('Menabrea');
    } finally {
      db.close();
      await db.delete();
    }
  });
});

describe('the photo square', () => {
  it('starts as the whole short side and stays inside the picture', () => {
    expect(cropSide(400, 300, 1)).toBe(300);
    expect(clampCrop({ x: 0, y: 0, zoom: 1 }, 400, 300)).toEqual({ x: 150, y: 150, zoom: 1 });
    expect(clampCrop({ x: 999, y: 999, zoom: 2 }, 400, 300)).toEqual({ x: 325, y: 225, zoom: 2 });
  });

  it('keeps the zoom between 1 and the most', () => {
    expect(clampCrop({ x: 200, y: 150, zoom: 0.2 }, 400, 300).zoom).toBe(1);
    expect(clampCrop({ x: 200, y: 150, zoom: 99 }, 400, 300).zoom).toBe(MAX_ZOOM);
  });
});
