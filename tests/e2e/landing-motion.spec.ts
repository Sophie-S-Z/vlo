import { expect, test, type Page } from "@playwright/test";
import { startInCalm, turnOnCalmNow } from "./calm";

const html = (page: Page) => page.locator("html");
const headline = "Write the book only you can write.";

async function effectsRunning(page: Page) {
  await expect(html(page)).toHaveClass(/\blenis\b/);
  await expect(html(page)).toHaveAttribute("data-effects", "ready");
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

  test("Calm never downloads the effects chunk", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await startInCalm(page);
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

test.describe("Landing demos (spec 18.3, M1a)", () => {
  test("FAQ answers open and close with the keyboard", async ({ page }) => {
    await page.goto("/");
    const question = page.locator("#faq summary").first();
    await question.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#faq details").first()).toHaveAttribute("open", "");
    await expect(page.locator("#faq details").first().locator("p")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("#faq details").first()).not.toHaveAttribute("open", "");
  });

  for (const mode of ["full", "calm"] as const) {
    test(`an AI card opens a modal that keeps focus and closes on Escape (${mode})`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      if (mode === "calm") await startInCalm(page);
      await page.goto("/");
      if (mode === "full") await effectsRunning(page);
      const card = page.locator("#ai [data-tilt]").first();
      await card.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
      await page.keyboard.press("Tab");
      // A modal dialog makes the page behind it inert. Tab may leave for the browser's own UI,
      // but it never reaches page content outside the dialog.
      expect(
        await dialog.evaluate(
          (d) => d.contains(document.activeElement) || document.activeElement === document.body,
        ),
      ).toBe(true);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(card).toBeFocused();
    });
  }

  test("Calm shows the final demo states", async ({ page }) => {
    await startInCalm(page);
    await page.goto("/");
    const bento = page.locator("[data-bento]");
    await expect(bento.getByText("$0")).toBeVisible();
    await expect(bento.getByText("Version 5 of 5")).toBeVisible();
    await expect(bento.locator("[data-format-cycle]")).toHaveText("DOCX");
  });
});

test.describe("Pointer polish (M1d)", () => {
  test("key words grow heavier near the pointer; buttons fill from the entry point", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile === true, "Fine pointers only");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await effectsRunning(page);

    const cta = page.locator("#top [data-magnetic]");
    await cta.hover();
    await expect(cta.locator("[data-magnetic-fill]")).toHaveCount(1);
    await expect(cta).toHaveAccessibleName("Join the waitlist");

    const word = page.locator("[data-key-word]").first();
    await word.scrollIntoViewIfNeeded();
    const box = (await word.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect
      .poll(() => word.evaluate((el) => Number(getComputedStyle(el).fontWeight)))
      .toBeGreaterThan(600);

    await page.getByRole("banner").getByRole("switch", { name: "Calm" }).focus();
    await page.keyboard.press("Space");
    await expect(word).not.toHaveAttribute("style", /font-weight/);
    await expect(page.locator("[data-magnetic-fill]")).toHaveCount(0);
  });
});

test.describe("Hold to sign (US16)", () => {
  const notConfigured = "The waitlist opens soon";

  test("a quick click does nothing; a 1.2 s hold submits", async ({ page, isMobile }) => {
    test.skip(isMobile === true, "Mouse hold runs on desktop");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/#waitlist");
    await page.getByLabel("Email").fill("ada@example.com");
    await page.waitForTimeout(2100); // the form rejects sign-ups faster than 2 s
    const button = page.getByRole("button", { name: "Hold to sign" });
    const alert = page.locator("#waitlist [role=alert]");
    await button.click();
    await expect(alert).toHaveText("");

    await button.hover();
    await page.mouse.down();
    await page.waitForTimeout(1300);
    await page.mouse.up();
    await expect(alert).toContainText(notConfigured);
  });

  test("Enter in the email field submits at once", async ({ page }) => {
    await page.goto("/#waitlist");
    await page.waitForTimeout(2100);
    await page.getByLabel("Email").fill("ada@example.com");
    await page.getByLabel("Email").press("Enter");
    await expect(page.locator("#waitlist [role=alert]")).toContainText(notConfigured);
  });

  test("an error shakes the form gently, and not with reduced motion", async ({ page }) => {
    await page.addInitScript(() => {
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (...args) {
        if (this instanceof HTMLFormElement) {
          const w = window as unknown as { formAnimations?: number };
          w.formAnimations = (w.formAnimations ?? 0) + 1;
        }
        return animate.apply(this, args);
      };
    });
    const formAnimations = () =>
      page.evaluate(() => (window as unknown as { formAnimations?: number }).formAnimations ?? 0);

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/#waitlist");
    await page.waitForTimeout(2100);
    await page.getByLabel("Email").fill("ada@example.com");
    await page.getByLabel("Email").press("Enter");
    await expect(page.locator("#waitlist [role=alert]")).toContainText(notConfigured);
    await expect.poll(formAnimations).toBe(1);

    await turnOnCalmNow(page);
    await page.getByLabel("Email").press("Enter");
    await page.waitForTimeout(300);
    expect(await formAnimations()).toBe(1);
  });
});

test.describe("Lovable merge springs (ADR 0012)", () => {
  test("the hero word springs to the next writer", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await effectsRunning(page);
    const word = page.locator("[data-rotate]");
    await expect(word).toHaveText("novelists");
    await expect(word).toHaveText("memoirists", { timeout: 5_000 });
    await expect(page.getByRole("heading", { level: 1, name: headline })).toBeVisible();
  });

  test("the AI dialog opens on a spring from its card", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await effectsRunning(page);
    await page.locator("#ai [data-tilt]").first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const animations = () => dialog.evaluate((d) => d.getAnimations().length);
    await expect.poll(animations).toBeGreaterThan(0);
    await expect.poll(animations, { timeout: 3_000 }).toBe(0);
  });

  test("the I write marker glides to the picked option", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    const marker = page.locator("[data-writer-marker]");
    const form = page.locator("#waitlist");
    await form.scrollIntoViewIfNeeded();
    await form.getByText("Novels", { exact: true }).click();
    await expect(marker).toHaveAttribute("data-on", "novels");
    const first = await marker.boundingBox();
    await form.getByText("Poetry", { exact: true }).click();
    await expect(marker).toHaveAttribute("data-on", "poetry");
    // It glides: a CSS transition runs instead of a jump.
    expect(await marker.evaluate((el) => el.getAnimations().length)).toBeGreaterThan(0);
    const target = await form.locator('[data-writer-option="poetry"]').boundingBox();
    await expect
      .poll(async () => Math.round((await marker.boundingBox())!.x))
      .toBe(Math.round(target!.x));
    expect(first!.x).not.toBe(target!.x);
  });
});

test.describe("Page turns and ink trail (ADR 0012)", () => {
  test("a page turns away as it arrives, and leaves no sheet behind", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await effectsRunning(page);
    const sheet = page.locator("#features > [data-turn]");
    await expect(sheet).toHaveCount(1);
    const top = await page
      .locator("#features")
      .evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    const screen = await page.evaluate(() => window.innerHeight);
    const angle = () =>
      sheet.evaluate((el) => {
        const m = new DOMMatrix(getComputedStyle(el).transform);
        return Math.round((Math.atan2(-m.m13, m.m11) * 180) / Math.PI);
      });
    await page.evaluate((y) => window.scrollTo(0, y), top - screen * 0.7);
    await expect.poll(angle).toBeLessThan(-5);
    await expect.poll(angle).toBeGreaterThan(-90);
    await page.evaluate((y) => window.scrollTo(0, y), top - screen * 0.1);
    await expect(sheet).toHaveCSS("visibility", "hidden");
  });

  test("gentle mode keeps the pages still", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(html(page)).toHaveAttribute("data-effects", "ready");
    await expect(page.locator("[data-turn]")).toHaveCount(0);
    await expect(page.locator("[data-ink-trail]")).toHaveCount(0);
  });

  test("a short ink trail follows the mouse, then fades", async ({ page, isMobile }) => {
    test.skip(isMobile === true, "Touch screens get no trail");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await effectsRunning(page);
    const inked = () =>
      page.locator("[data-ink-trail]").evaluate((canvas) => {
        const c = canvas as HTMLCanvasElement;
        const data = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
        let count = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) count++;
        return count;
      });
    await page.mouse.move(200, 400);
    await page.mouse.move(600, 420, { steps: 12 });
    await expect.poll(inked).toBeGreaterThan(50);
    await expect.poll(inked, { timeout: 3_000 }).toBe(0);
  });
});
