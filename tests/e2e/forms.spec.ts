import { expect, test, type Page } from "@playwright/test";
import { startInCalm } from "./calm";

async function startEffects(page: Page) {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/\blenis\b/);
  await expect(page.locator("html")).toHaveAttribute("data-effects", "ready");
}

/** The nav hides on scroll down, so the switch is used by keyboard, as a visitor might. */
async function calm(page: Page) {
  await page.getByRole("banner").getByRole("switch", { name: "Calm" }).focus();
  await page.keyboard.press("Space");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
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

  test("Calm never loads Matter.js", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await startInCalm(page);
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
    await calm(page);
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
    await calm(page);
    await expect(list).not.toHaveAttribute("data-canvas", "on");
    await expect(page.locator("[data-clone]")).toHaveCount(0);
    expect(await page.locator("[data-line-card]").first().getAttribute("style")).toBeFalsy();
  });
});

test.describe("M1c teardown and keyboard (review)", () => {
  test("Calm restores the forms DOM and React still owns it", async ({ page }) => {
    await startEffects(page);
    const thread = page.locator('[data-thread="0"]');
    await expect(thread).not.toHaveAttribute("x1", "24");
    const name = page.locator('[data-real="Aunt Rosa"]');
    await name.focus();
    await page.keyboard.press("Enter");
    await expect(name).toHaveAttribute("aria-pressed", "true");
    await calm(page);
    await expect(page.locator("html")).not.toHaveClass(/\blenis\b/);

    await expect(thread).toHaveAttribute("x1", "24");
    await expect(page.locator("[data-forms-track]")).not.toHaveAttribute("data-track", "row");
    await expect(page.locator("[data-poem-line]").nth(1)).toHaveText(
      "      keeps its one note going.",
    );
    await expect(name).toHaveAttribute("data-text", "Aunt Maria");
    const card = page.locator("[data-drag-card]").first();
    await expect(card).toHaveCSS("transform", /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
    await expect(card).not.toHaveAttribute("style", /position: absolute/);

    await page.getByRole("button", { name: "Grid" }).click();
    await expect(page.locator("[data-thread]")).toHaveCount(0);
    await page.getByRole("button", { name: "Board" }).click();
    await expect(page.locator("[data-thread]")).toHaveCount(5);
    await name.click();
    await expect(name).toHaveAttribute("data-text", "Aunt Rosa");
  });

  test("fast mode switching ends on the chosen icon", async ({ page }) => {
    await startEffects(page);
    const section = page.locator("#privacy");
    await section.scrollIntoViewIfNeeded();
    await section.getByText("Reader", { exact: true }).click();
    await section.getByText("Co-writer", { exact: true }).click();
    await page.waitForTimeout(150);
    await section.getByText("Pen", { exact: true }).click();
    await page.waitForTimeout(1000);
    await calm(page);
    const pen = await section.locator('input[value="pen"]').getAttribute("data-icon");
    await expect(page.locator("[data-mode-icon]")).toHaveAttribute("d", pen!);
  });

  test("hover slows the marquee rows", async ({ page, isMobile }) => {
    test.skip(isMobile === true, "Hover runs on desktop");
    await startEffects(page);
    const row = page.locator("#first-lines [data-marquee]").first();
    await row.scrollIntoViewIfNeeded();
    const x = () => row.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41);
    const travel = async () => {
      const a = await x();
      await page.waitForTimeout(800);
      return Math.abs((await x()) - a);
    };
    await page.mouse.move(5, 5);
    await page.waitForTimeout(600);
    const free = await travel();
    // The row never stops moving, so the pointer goes to its fixed parent instead.
    const band = (await row.locator("..").boundingBox())!;
    await page.mouse.move(band.x + band.width / 2, band.y + band.height / 2);
    await page.waitForTimeout(800);
    const slowed = await travel();
    expect(slowed).toBeLessThan(free * 0.6);
  });

  test("keyboard focus in an off-screen panel of the pinned row brings it on screen", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile === true, "The pinned row is desktop only");
    await startEffects(page);
    const section = page.locator("#forms");
    const top = await section.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    await page.evaluate((y) => window.scrollTo(0, y + 1100), top);
    const grid = page.getByRole("button", { name: "Grid" });
    await expect.poll(async () => (await grid.boundingBox())!.x).toBeLessThan(0);
    await grid.focus();
    await expect(grid).toBeInViewport();
  });

  test("a layout refresh keeps keyboard focus inside a pinned section", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile === true, "The pinned row is desktop only");
    await startEffects(page);
    const grid = page.getByRole("button", { name: "Grid" });
    await grid.focus();
    await expect(grid).toBeFocused();
    // A resize refreshes every ScrollTrigger, which moves each pin out of its spacer and back.
    const size = page.viewportSize()!;
    await page.setViewportSize({ width: size.width + 1, height: size.height });
    await page.waitForTimeout(600);
    await expect(grid).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("list", { name: "Scene cards" })).toHaveAttribute(
      "data-layout",
      "grid",
    );
  });
});

test.describe("The book opens (spec 18.3 p.03, ADR 0012)", () => {
  const spacerTop = (page: Page) =>
    page.locator("#book").evaluate((el) => {
      const box = el.parentElement?.classList.contains("pin-spacer") ? el.parentElement : el;
      return box.getBoundingClientRect().top + window.scrollY;
    });
  const activeCaption = (page: Page) => page.locator("#book [data-book-steps] > li[data-active] p");

  test("the section pins, steps through the captions and closes with the iris", async ({
    page,
  }) => {
    await startEffects(page);
    const section = page.locator("#book");
    await expect(section).toHaveAttribute("data-story", "");
    await expect(page.locator(".pin-spacer > #book")).toHaveCount(1);
    // Screen readers get all five captions at once.
    await expect(section.locator("[data-book-steps]")).toHaveAttribute("aria-hidden", "true");
    await expect(section.locator("ol.sr-only > li")).toHaveCount(5);
    const top = await spacerTop(page);
    const screen = await page.evaluate(() => window.innerHeight);
    const pin =
      (await page
        .locator(".pin-spacer:has(> #book)")
        .evaluate((el) => (el as HTMLElement).offsetHeight)) -
      (await section.evaluate((el) => (el as HTMLElement).offsetHeight));

    await page.evaluate((y) => window.scrollTo(0, y + 10), top);
    await expect(activeCaption(page)).toHaveText("Every book starts as loose pages.");
    await page.evaluate((y) => window.scrollTo(0, y), top + pin * 0.6);
    await expect(activeCaption(page)).toHaveText("Memoirs get a timeline of your life.");
    // The section stays on screen while pinned.
    expect(Math.abs((await section.boundingBox())!.y)).toBeLessThan(2);
    await page.evaluate((y) => window.scrollTo(0, y), top + pin * 0.97);
    await expect
      .poll(() =>
        page
          .locator("[data-book-iris]")
          .evaluate((el) => parseFloat(el.style.clipPath.replace(/[^\d.]/g, ""))),
      )
      .toBeGreaterThan(50);
    expect(screen).toBeGreaterThan(0);
  });

  test("Calm unpins the story and shows every caption", async ({ page }) => {
    await startEffects(page);
    await expect(page.locator(".pin-spacer > #book")).toHaveCount(1);
    await calm(page);
    await expect(page.locator(".pin-spacer > #book")).toHaveCount(0);
    await expect(page.locator("#book")).not.toHaveAttribute("data-story", /.*/);
    await expect(page.locator("[data-book-iris]")).toHaveCount(0);
    for (const li of await page.locator("#book [data-book-steps] > li").all()) {
      await expect(li).toBeVisible();
    }
  });
});
