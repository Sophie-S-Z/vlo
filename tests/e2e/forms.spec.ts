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

test.describe("Memoir panel (spec 18.3 p.04, M1c)", () => {
  test("hover scrambles a name to its alias; a click keeps it", async ({ page, isMobile }) => {
    test.skip(isMobile === true, "Hover runs on desktop");
    await startEffects(page);
    const name = page.locator('[data-real="Aunt Rosa"]');
    await name.scrollIntoViewIfNeeded();
    await name.hover();
    await expect(name).toHaveAttribute("data-text", "Aunt Maria");
    await name.click();
    await expect(name).toHaveAccessibleName("Aunt Maria");
    await page.mouse.move(5, 5);
    await page.waitForTimeout(700);
    await expect(name).toHaveAttribute("data-text", "Aunt Maria");
  });

  test("a tap switches the name and the visible text follows", async ({ page }) => {
    await startEffects(page);
    const name = page.locator('[data-real="Grandpa Ilya"]');
    await name.focus();
    await page.keyboard.press("Enter");
    await expect(name).toHaveAccessibleName("Grandpa Ivan");
    await expect(name).toHaveAttribute("data-text", "Grandpa Ivan");
  });
});

test.describe("Poetry panel (spec 18.3 p.04, M1c)", () => {
  test("the poem types itself and ends with exact indents", async ({ page }) => {
    await startEffects(page);
    const line = page.locator("[data-poem-line]").nth(1);
    await expect(line).toHaveText(/^ +$/);
    await page.locator("[data-poem]").scrollIntoViewIfNeeded();
    if (!(await page.locator("[data-forms-track][data-track=row]").count())) {
      await expect(line).toHaveText("      keeps its one note going.", { timeout: 8000 });
    }
  });

  test("Matter.js loads only near the word tiles, and the tiles fall", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await startEffects(page);
    const physics = () => requests.filter((url) => /\/assets\/magnets-/.test(url));
    expect(physics()).toEqual([]);
    const box = page.locator("[data-magnets]");
    const top = await box.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    // In the row layout the box sits off to the right; scroll until it is on screen.
    for (let y = top - 400; y < top + 4000; y += 400) {
      await page.evaluate((to) => window.scrollTo(0, to), y);
      await page.waitForTimeout(150);
      if (await box.getAttribute("data-physics")) break;
    }
    await expect(box).toHaveAttribute("data-physics", "on");
    expect(physics().length).toBeGreaterThan(0);
    const tile = page.locator("[data-magnet]").first();
    await expect.poll(() => tile.evaluate((el) => el.style.transform)).toMatch(/translate\(/);
  });

  test("reduced motion never loads Matter.js", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.locator("[data-magnets]").scrollIntoViewIfNeeded();
    await page.waitForLoadState("networkidle");
    expect(requests.filter((url) => /\/assets\/(magnets|matter)/.test(url))).toEqual([]);
  });
});
