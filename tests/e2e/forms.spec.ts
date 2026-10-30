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
    const trackTop = page
      .locator("[data-forms-track]")
      .evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.round(await trackTop)).toBe(80);
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

test.describe("Novel panel (spec 18.3 p.04, M1c)", () => {
  test("dragging a card moves it and its thread follows", async ({ page, isMobile }) => {
    test.skip(isMobile === true, "Mouse drag runs on desktop");
    await startEffects(page);
    const card = page.locator("[data-drag-card]").first();
    const thread = page.locator('[data-thread="0"]');
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const box = (await card.boundingBox())!;
    const before = await thread.getAttribute("x1");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 60, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await card.boundingBox())!.y).toBeGreaterThan(box.y + 30);
    expect(await thread.getAttribute("x1")).not.toBe(before);
  });

  test("Grid and Board switch with the keyboard", async ({ page }) => {
    await startEffects(page);
    const cards = page.getByRole("list", { name: "Scene cards" });
    await page.getByRole("button", { name: "Grid" }).focus();
    await page.keyboard.press("Enter");
    await expect(cards).toHaveAttribute("data-layout", "grid");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(cards).toHaveAttribute("data-layout", "board");
    await expect(page.locator("[data-thread]")).toHaveCount(5);
  });
});
