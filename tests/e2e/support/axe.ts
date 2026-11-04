import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

/**
 * Serious and critical WCAG 2.2 AA issues on the page, as "rule: targets" lines.
 * Entrance animations finish first, so axe reads final colours and never a half-faded frame. An animation
 * can start late, such as the word count's roll after a save, so the wait repeats until two quiet frames.
 */
export async function seriousIssues(page: Page): Promise<string[]> {
  await page.evaluate(async () => {
    const running = () =>
      document
        .getAnimations()
        .filter(
          (a) =>
            a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime ?? Infinity),
        );
    const frame = () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    for (let i = 0; i < 20; i++) {
      await Promise.all(running().map((a) => a.finished.catch(() => undefined)));
      await frame();
      await frame();
      if (running().length === 0) return;
    }
  });
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} (${n.failureSummary ?? ''})`).join(', ')}`,
    );
}
