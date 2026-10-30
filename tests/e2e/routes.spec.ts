import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./a11y";

const ROUTES = [
  { path: "/", heading: "Write the book only you can write." },
  { path: "/privacy", heading: "Privacy" },
  { path: "/ai-policy", heading: "AI policy" },
  { path: "/share/abc123", heading: "Shared draft" },
  { path: "/app", heading: "This page isn't written yet" },
  { path: "/no-such-page", heading: "This page isn't written yet" },
];

for (const { path, heading } of ROUTES) {
  test(`${path} loads by direct URL with no serious a11y issues`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    expect(errors, "console errors, including CSP violations").toEqual([]);
  });
}

test("the page has no horizontal scroll", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the landing page does not link to the hidden app", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('a[href^="/app"]')).toHaveCount(0);
});

for (const theme of ["ink", "paper", "night", "sepia"]) {
  test(`the ${theme} theme meets contrast and a11y budgets`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem("vlo:theme:landing", t), theme);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expectNoSeriousA11yViolations(page);
  });
}

test.describe("prerendered landing page (spec 18.4: the HTML headline is the LCP element)", () => {
  test.use({ javaScriptEnabled: false });

  test("the headline shows with JavaScript off", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: "Write the book only you can write." }),
    ).toBeVisible();
  });
});

test("hydration keeps stored preferences and logs no errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
  page.on("pageerror", (err) => errors.push(err.message));
  await page.addInitScript(() => {
    localStorage.setItem("vlo:theme:landing", "sepia");
    localStorage.setItem("vlo:calm", "on");
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "sepia");
  await expect(page.getByRole("banner").getByRole("switch", { name: "Calm" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByRole("banner").getByRole("radio", { name: "Sepia" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  expect(errors).toEqual([]);
});
