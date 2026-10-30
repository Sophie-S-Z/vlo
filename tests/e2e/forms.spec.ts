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

test.describe("Privacy (spec 18.3 p.05, M1c)", () => {
  test("the mode switch morphs the badge and the flashlight ends fully lit", async ({ page }) => {
    await startEffects(page);
    const section = page.locator("#privacy");
    await section.scrollIntoViewIfNeeded();
    const icon = page.locator("[data-mode-icon]");
    const before = await icon.getAttribute("d");
    await section.getByText("Reader", { exact: true }).click();
    await expect(page.getByTestId("mode-badge")).toContainText("Questions and notes");
    await expect.poll(() => icon.getAttribute("d")).not.toBe(before);
    await expect(page.getByTestId("vlo-requests")).toHaveText("0");

    const light = page.locator("[data-flashlight]");
    await expect(light).toHaveCSS("mask-image", /radial-gradient/);
    const top = await light.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    await page.evaluate((y) => window.scrollTo(0, y - window.innerHeight * 0.2), top);
    await expect
      .poll(() =>
        light.evaluate((el) => parseFloat(getComputedStyle(el).getPropertyValue("--light-r"))),
      )
      .toBeGreaterThan(300);
  });

  test("Calm removes the flashlight mask", async ({ page }) => {
    await startEffects(page);
    const light = page.locator("[data-flashlight]");
    await expect(light).toHaveCSS("mask-image", /radial-gradient/);
    await page.getByRole("banner").getByRole("switch", { name: "Calm" }).click();
    await expect(light).toHaveCSS("mask-image", "none");
  });
});

test.describe("First lines (spec 18.3 p.08, M1c)", () => {
  test("the grid drags and wraps around", async ({ page, isMobile }) => {
    test.skip(isMobile === true, "Mouse drag runs on desktop");
    await startEffects(page);
    const list = page.locator("[data-first-lines]");
    await expect(list).toHaveAttribute("data-canvas", "on");
    await list.scrollIntoViewIfNeeded();
    const card = page.locator("[data-line-card]").first();
    const x = () => card.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41);
    const before = await x();
    const box = (await list.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 600, box.y + 40, { steps: 12 });
    await page.mouse.up();
    // Dragging left by 600 px moves the first card off the left edge, so it wraps to the right.
    await expect.poll(x).not.toBeCloseTo(before - 600, -1);
    expect(Math.abs((await x()) - before)).toBeGreaterThan(50);
    expect(await x()).toBeGreaterThan(-400);
  });

  test("a blank card leads to the waitlist with focus in the email field", async ({ page }) => {
    await startEffects(page);
    const blank = page.locator("[data-blank-card]").first();
    await blank.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Email")).toBeFocused();
    await expect(page.locator("#waitlist")).toBeInViewport();
    await expect(page.locator("[data-zoom-card]")).toHaveCount(0);
  });

  test("Calm puts back the static grid", async ({ page }) => {
    await startEffects(page);
    const list = page.locator("[data-first-lines]");
    await expect(list).toHaveAttribute("data-canvas", "on");
    await page.getByRole("banner").getByRole("switch", { name: "Calm" }).click();
    await expect(list).not.toHaveAttribute("data-canvas", "on");
    await expect(page.locator("[data-clone]")).toHaveCount(0);
    expect(await page.locator("[data-line-card]").first().getAttribute("style")).toBeFalsy();
  });
});
