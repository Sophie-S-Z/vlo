import { expect, test } from "@playwright/test";

test.describe("Sound (spec 18.1 item 10, M1d)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const Original = window.AudioContext;
      (window as unknown as { __audioContexts: number }).__audioContexts = 0;
      window.AudioContext = class extends Original {
        constructor(options?: AudioContextOptions) {
          super(options);
          (window as unknown as { __audioContexts: number }).__audioContexts++;
        }
      };
    });
  });

  const contexts = (page: import("@playwright/test").Page) =>
    page.evaluate(() => (window as unknown as { __audioContexts: number }).__audioContexts);

  test("no audio starts until the visitor turns sound on", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await page.mouse.move(300, 300);
    await page.waitForTimeout(500);
    expect(await contexts(page)).toBe(0);

    const sound = page.getByRole("contentinfo").getByRole("switch", { name: "Sound" });
    await sound.focus();
    await page.keyboard.press("Space");
    await expect(sound).toHaveAttribute("aria-checked", "true");
    await expect.poll(() => contexts(page)).toBe(1);

    await page.keyboard.press("Space");
    await expect(sound).toHaveAttribute("aria-checked", "false");
  });

  test("Calm keeps the sound switch off", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const sound = page.getByRole("contentinfo").getByRole("switch", { name: "Sound" });
    await expect(sound).toBeDisabled();
    expect(await contexts(page)).toBe(0);
  });
});
