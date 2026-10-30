import type { Page } from "@playwright/test";

/** Turns Calm on before the page loads (ADR 0011: only Calm gives the still page). */
export async function startInCalm(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem("vlo:calm", "on"));
}

/** Turns Calm on in an open page, the way another tab would. */
export async function turnOnCalmNow(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.setItem("vlo:calm", "on");
    window.dispatchEvent(new StorageEvent("storage", { key: "vlo:calm" }));
  });
}
