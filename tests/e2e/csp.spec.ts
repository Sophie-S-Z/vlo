import { expect, test } from '@playwright/test';

for (const path of ['/', '/settings', '/nope']) {
  test(`${path} loads under the production CSP with 0 violations`, async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (msg) => {
      if (/Content Security Policy|Content-Security-Policy|CSP/i.test(msg.text()))
        violations.push(msg.text());
    });
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => {
        console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`);
      });
    });
    const response = await page.goto(path);
    expect(response?.headers()['content-security-policy']).toContain("default-src 'self'");
    expect(response?.headers()['referrer-policy']).toBe('no-referrer');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      await document.fonts.ready;
    });
    expect(violations).toEqual([]);
  });
}
