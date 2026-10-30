import { expect, test, type Page } from "@playwright/test";

async function startEffects(page: Page) {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/\blenis\b/);
}

const trackX = (page: Page) =>
  page
    .locator("[data-forms-track]")
    .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41);

test.describe("Three forms track (spec 18.3 p.04, M1c)", () => {
  test("on wide screens the section pins and the panels move left", async ({ page, isMobile }) => {
    test.skip(isMobile === true, "Phones keep the vertical stack");
    await startEffects(page);
    const section = page.locator("#forms");
    await expect(page.locator("[data-forms-track]")).toHaveAttribute("data-track", "row");
    const top = await section.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    await page.evaluate((y) => window.scrollTo(0, y + 900), top);
    await expect.poll(() => trackX(page)).toBeLessThan(-200);
    expect(await section.evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBe(0);
  });

  test("phones keep the vertical stack with no horizontal scroll", async ({ page, isMobile }) => {
    test.skip(isMobile !== true, "Phone layout");
    await startEffects(page);
    await expect(page.locator("[data-forms-track]")).not.toHaveAttribute("data-track", "row");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
