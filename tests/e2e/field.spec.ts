import { expect, test } from "@playwright/test";
import { startInCalm } from "./calm";

// SwiftShader gives headless Chromium a software WebGL context, so the canvas path runs in CI.
test.use({ launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } });

// The field skips software renderers in production; this switch turns it on for the test.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("vlo:field-force", "1"));
});

const field = "canvas[data-field]";
const heroArt = '[data-still-art="hero"]';

test.describe("Particle field (spec 18.1 item 7, 18.2)", () => {
  test("the canvas runs with full motion and hides the still art", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await expect(page.locator(field)).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator(field)).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator(heroArt)).toBeHidden();
  });

  test("Calm removes the canvas and brings the still art back", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await expect(page.locator(field)).toHaveCount(1, { timeout: 15_000 });
    const calm = page.getByRole("banner").getByRole("switch", { name: "Calm" });
    await calm.focus();
    await page.keyboard.press("Space");
    await expect(page.locator(field)).toHaveCount(0);
    await expect(page.locator(heroArt)).toBeVisible();
  });

  test("a software renderer keeps the still art without the test switch", async ({ browser }) => {
    const page = await browser.newPage();
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/\blenis\b/);
    await page.waitForTimeout(1000);
    await expect(page.locator(field)).toHaveCount(0);
    await expect(page.locator(heroArt)).toBeVisible();
    await page.close();
  });

  test("Calm never loads three.js and keeps the still art", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await startInCalm(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(requests.filter((url) => /\/assets\/field-/.test(url))).toEqual([]);
    await expect(page.locator(field)).toHaveCount(0);
    await expect(page.locator(heroArt)).toBeVisible();
  });
});
