import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./a11y";
import { startInCalm } from "./calm";

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Entry curtain (spec 18.3 p.00, M1d)", () => {
  test("a first visit shows the curtain; Enter in silence opens the page", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    const dialog = page.getByRole("dialog", { name: "Welcome to Vlo" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Let's put them in order.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Skip intro" })).toBeVisible();
    // Pointing at the intro holds the curtain, so axe and the click see it.
    await dialog.getByText("Every book starts as a mess.").hover();
    const silence = dialog.getByRole("button", { name: "Enter in silence" });
    await expect(silence).toBeVisible({ timeout: 10_000 });
    await expectNoSeriousA11yViolations(page);

    await silence.click();
    await expect(dialog).toBeHidden();
    await expect(page.locator("#main")).toBeFocused();
    await expect(page.locator("html")).not.toHaveAttribute("data-entry", /.*/);

    await page.reload();
    await expect(page.locator("html")).not.toHaveAttribute("data-entry", /.*/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("the curtain opens by itself in about 1.5 s (5A)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    const dialog = page.getByRole("dialog", { name: "Welcome to Vlo" });
    await expect(dialog).toBeVisible();
    const shown = Date.now();
    await expect(dialog).toHaveCount(0, { timeout: 5_000 });
    expect(Date.now() - shown).toBeLessThan(2_500);
    await expect(page.locator("#main")).toBeFocused();
  });

  test("Escape skips the intro", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await expect(page.getByRole("dialog", { name: "Welcome to Vlo" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("Calm and other routes never show the curtain", async ({ page }) => {
    await startInCalm(page);
    await page.goto("/");
    await expect(page.locator("html")).not.toHaveAttribute("data-entry", /.*/);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/privacy");
    await expect(page.locator("html")).not.toHaveAttribute("data-entry", /.*/);
  });
});
