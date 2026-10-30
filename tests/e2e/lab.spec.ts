import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./a11y";

test.describe("Ink lab, grain and tilt (spec 18.1 items 10 to 12)", () => {
  test("~ opens the Ink lab; its grain control changes the film grain", async ({ page }) => {
    const tweakpane: string[] = [];
    page.on("request", (r) => /tweakpane|panel/.test(r.url()) && tweakpane.push(r.url()));
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(tweakpane).toEqual([]);

    await page.keyboard.press("~");
    const lab = page.getByRole("region", { name: "Ink lab" });
    await expect(lab).toBeVisible();
    await expect(lab.getByText("Particles")).toBeVisible();
    await expect(lab.getByText("Bloom")).toBeVisible();
    expect(tweakpane.length).toBeGreaterThan(0);

    const before = await page
      .locator("[data-grain]")
      .evaluate((el) => Number(getComputedStyle(el).opacity));
    expect(before).toBeGreaterThanOrEqual(0.04);
    expect(before).toBeLessThanOrEqual(0.05);
    const grainInput = lab.locator(".tp-lblv", { hasText: "Grain" }).locator("input");
    await grainInput.fill("0.1");
    await grainInput.press("Enter");
    await expect
      .poll(() =>
        page.locator("[data-grain]").evaluate((el) => Number(getComputedStyle(el).opacity)),
      )
      .toBeCloseTo(0.1);

    await lab.getByRole("button", { name: "Close Ink lab" }).focus();
    await page.keyboard.press("Escape");
    await expect(lab).toBeHidden();
  });

  test("the footer button opens the lab and the panel passes axe", async ({ page }) => {
    await page.goto("/");
    const button = page.getByRole("contentinfo").getByRole("button", { name: "Ink lab" });
    await button.click();
    const lab = page.getByRole("region", { name: "Ink lab" });
    await expect(lab.getByText("Grain")).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await lab.getByRole("button", { name: "Close Ink lab" }).click();
    await expect(button).toBeFocused();
  });

  test("the grain moves with full motion and stays still with reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    const name = () =>
      page.locator("[data-grain-noise]").evaluate((el) => getComputedStyle(el).animationName);
    const running = () =>
      page.locator("[data-grain-noise]").evaluate((el) => el.getAnimations().length);
    expect(await name()).toBe("grain");
    expect(await running()).toBe(1);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await expect.poll(running).toBe(0);
  });

  test("Enable motion shows only on touch screens", async ({ page, isMobile }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    const button = page.getByRole("button", { name: "Enable motion" });
    if (isMobile) await expect(button).toBeVisible();
    else await expect(button).toBeHidden();
  });
});
