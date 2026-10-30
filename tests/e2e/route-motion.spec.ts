import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./a11y";

const transforms = (page: Page) =>
  page
    .locator("[data-letter]")
    .evaluateAll((letters) => letters.map((letter) => getComputedStyle(letter).transform));

test.describe("Route wipes and 404 physics (spec 18.3, M1d)", () => {
  test("a route change sweeps five bars; reduced motion shows none", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/privacy");
    await expect(page.locator("[data-wipe-bar]")).toHaveCount(0);
    await page.getByRole("banner").getByRole("link", { name: "Vlo" }).click();
    await expect(page.locator("[data-wipe-bar]")).toHaveCount(5);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/privacy");
    await page.getByRole("banner").getByRole("link", { name: "Vlo" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Write the book");
    await expect(page.locator("[data-wipe-bar]")).toHaveCount(0);
  });

  test("the 404 letters fall and can be thrown; Calm puts them back", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/no-such-page");
    const heading = page.getByRole("heading", { level: 1, name: "This page isn't written yet" });
    await expect(heading).toBeVisible();
    await expect(page.locator("[data-letter-box]")).toHaveAttribute("data-physics", "on");
    await expect
      .poll(async () => (await transforms(page)).filter((t) => t !== "none").length)
      .toBe(await page.locator("[data-letter]").count());
    await expectNoSeriousA11yViolations(page);

    await page.getByRole("banner").getByRole("switch", { name: "Calm" }).click();
    await expect(page.locator("[data-letter-box]")).not.toHaveAttribute("data-physics", "on");
    expect(new Set(await transforms(page))).toEqual(new Set(["none"]));
  });

  test("reduced motion keeps the 404 letters still and loads no physics", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const matter: string[] = [];
    page.on("request", (r) => /magnets|matter/.test(r.url()) && matter.push(r.url()));
    await page.goto("/no-such-page");
    await page.waitForTimeout(1500);
    expect(matter).toEqual([]);
    expect(new Set(await transforms(page))).toEqual(new Set(["none"]));
  });
});
