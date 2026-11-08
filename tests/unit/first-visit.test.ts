import { afterEach, beforeEach, expect, test } from 'vitest';
import { markOnboarded, needsOnboarding } from '@/features/onboarding/firstVisit';
import { db } from '@/lib/db';

beforeEach(async () => {
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

test('a fresh profile needs onboarding', async () => {
  expect(await needsOnboarding()).toBe(true);
});

test('after onboarding, the welcome screen does not come back', async () => {
  await markOnboarded();
  expect(await needsOnboarding()).toBe(false);
  expect(typeof (await db.appMeta.get('onboardedAt'))?.value).toBe('number');
});

test('a profile that already has a project does not need onboarding', async () => {
  await db.projects.add({
    id: 'p',
    title: 'Kept',
    templates: ['novel'],
    aiMode: 'pen',
    createdAt: 1,
    updatedAt: 1,
    settings: { snapshotEveryMinutes: 10, aliasAiRequests: false, streaksEnabled: false, restDays: [] },
  });
  expect(await needsOnboarding()).toBe(false);
});
