import { expect, test } from '@playwright/test';
import { skipOnboarding } from './support/onboarding';

/* Plan Task F4: the Help and Privacy pages, from the footer. Their axe checks are in a11y.spec.ts. */

test('Help gives the guide and support links that open in a new tab with no referrer', async ({ page }) => {
  await skipOnboarding(page);
  await page.getByRole('contentinfo').getByRole('link', { name: 'Help' }).click();
  await expect(page).toHaveURL(/\/help$/);
  await expect(page).toHaveTitle(/Help/);
  await expect(page.getByRole('heading', { level: 2, name: 'When the writing is painful' })).toBeVisible();
  const support = page.getByRole('link', { name: /Find A Helpline|988|Samaritans/ });
  await expect(support).toHaveCount(3);
  for (const link of await support.all()) {
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noreferrer');
  }
  await expect(
    page.getByRole('heading', { level: 2, name: 'Back up and move to a new computer' }),
  ).toBeVisible();
});

test('Privacy lists what stays and each purpose that can leave, with its hosts', async ({ page }) => {
  await skipOnboarding(page);
  await page.getByRole('contentinfo').getByRole('link', { name: 'Privacy' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole('heading', { level: 3 })).toHaveText([
    'AI requests',
    'In-browser model files',
    'Share links and comments',
    'Weekly usage counts',
    'The web originality check',
  ]);
  await expect(page.getByText('en.wikipedia.org, api.openalex.org')).toBeVisible();
  // The test build has a fake Supabase project.
  await expect(page.getByText('vlo-test.supabase.co')).toHaveCount(2);
});
