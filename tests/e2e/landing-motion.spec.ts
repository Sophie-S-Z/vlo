import { expect, test, type Page } from "@playwright/test";

const html = (page: Page) => page.locator("html");
const headline = "Write the book only you can write.";

async function effectsRunning(page: Page) {
  await expect(html(page)).toHaveClass(/\blenis\b/);
}

test.describe("Landing effects (spec 18.1, M1a)", () => {
  test("effects load with full motion and keep the headline as real text", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await effectsRunning(page);
    await expect(page.getByRole("heading", { level: 1, name: headline })).toBeVisible();
  });

  test("Calm mid-page stops smooth scroll and removes every effect", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await effectsRunning(page);
    await page.mouse.move(200, 200);
    await page.mouse.wheel(0, 2500);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);

    const calm = page.getByRole("banner").getByRole("switch", { name: "Calm" });
    await calm.focus();
    await page.keyboard.press("Space");
    await expect(html(page)).toHaveAttribute("data-motion", "reduced");

    await expect(html(page)).not.toHaveClass(/\blenis\b/);
    await expect(html(page)).not.toHaveClass(/has-custom-cursor/);
    await expect(page.locator("[data-cursor]")).toHaveCount(0);
    await expect(page.locator(".pin-spacer")).toHaveCount(0);
    await expect(page.locator("h1").locator("*")).toHaveCount(0);
    await expect(page.locator("h1")).toHaveText(headline);
    await expect(page.locator("[data-ink-line]")).toHaveAttribute("style", /scaleX\(0\)/);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
  });

  test("reduced motion never downloads the effects chunk", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(html(page)).toHaveAttribute("data-motion", "reduced");
    await page.waitForLoadState("networkidle");
    expect(requests.filter((url) => /\/assets\/(effects|gsap|lenis)/.test(url))).toEqual([]);
    await expect(html(page)).not.toHaveClass(/\blenis\b/);
  });

  test("a nav link glides to its section and moves focus there", async ({ page, isMobile }) => {
    test.skip(isMobile === true, "Section links show from the md breakpoint");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await effectsRunning(page);
    await page
      .getByRole("navigation", { name: "Sections" })
      .getByRole("link", { name: "FAQ" })
      .click();
    await expect(page).toHaveURL(/#faq$/);
    await expect(page.locator("#faq")).toBeFocused();
    await expect(page.locator("#faq")).toBeInViewport();
  });
});
