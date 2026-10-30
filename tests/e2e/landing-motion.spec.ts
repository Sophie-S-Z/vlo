import { expect, test, type Page } from "@playwright/test";

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

  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    test(`an AI card opens a modal that keeps focus and closes on Escape (${reducedMotion})`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion });
      await page.goto("/");
      if (reducedMotion === "no-preference") await effectsRunning(page);
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

  test("reduced motion shows the final demo states", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const bento = page.locator("[data-bento]");
    await expect(bento.getByText("$0")).toBeVisible();
    await expect(bento.getByText("Version 5 of 5")).toBeVisible();
    await expect(bento.locator("[data-format-cycle]")).toHaveText("DOCX");
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
});
