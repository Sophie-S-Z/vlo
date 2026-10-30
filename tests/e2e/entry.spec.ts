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
