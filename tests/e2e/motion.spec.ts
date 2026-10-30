import { expect, test } from "@playwright/test";

const html = (page: import("@playwright/test").Page) => page.locator("html");

test.describe("Calm mode and reduced motion (spec F08, M0 gate)", () => {
  test("full motion by default", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await expect(html(page)).toHaveAttribute("data-motion", "full");
    await expect(html(page)).toHaveAttribute("data-calm", "off");
  });

  test("the system reduced-motion setting reduces motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(html(page)).toHaveAttribute("data-motion", "reduced");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(html(page)).toHaveAttribute("data-motion", "full");
  });

  test("the Calm switch reduces motion and survives a reload", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    const calm = page.getByRole("switch", { name: "Calm" });
    await calm.click();
    await expect(calm).toHaveAttribute("aria-checked", "true");
    await expect(html(page)).toHaveAttribute("data-motion", "reduced");

    await page.reload();
    await expect(page.getByRole("switch", { name: "Calm" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(html(page)).toHaveAttribute("data-motion", "reduced");

    await page.getByRole("switch", { name: "Calm" }).click();
    await expect(html(page)).toHaveAttribute("data-motion", "full");
  });

  test("the reduced-motion CSS stops transitions", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const duration = await page
      .getByRole("switch", { name: "Calm" })
      .evaluate((el) => getComputedStyle(el.querySelector("span")!).transitionDuration);
    expect(parseFloat(duration)).toBeLessThan(0.001);
  });
});

test.describe("theme switch", () => {
  test("landing defaults to Ink and switches to Paper", async ({ page }) => {
    await page.goto("/");
    await expect(html(page)).toHaveAttribute("data-theme", "ink");
    await page.getByRole("radio", { name: "Paper" }).click();
    await expect(html(page)).toHaveAttribute("data-theme", "paper");
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe("rgb(245, 241, 232)");
  });

  test("arrow keys move through the themes", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("radio", { name: "Ink" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(html(page)).toHaveAttribute("data-theme", "paper");
    await expect(page.getByRole("radio", { name: "Paper" })).toBeFocused();
  });

  test("the share view defaults to Paper", async ({ page }) => {
    await page.goto("/share/abc");
    await expect(html(page)).toHaveAttribute("data-theme", "paper");
  });
});
