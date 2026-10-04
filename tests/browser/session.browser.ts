import { test, expect } from "@playwright/test";
import { captureEvidence, FIXTURE_PASSWORD, placePinByLocation, signIn, USERS } from "./helpers.js";

const email = process.env.SESSION_TEST_EMAIL ?? USERS.citizen1;
const password = process.env.SESSION_TEST_PASSWORD ?? FIXTURE_PASSWORD;

test.beforeEach(async ({ page }) => {
  await signIn(page, email, password);
  await expect(page).toHaveURL(/my-reports/);
});

test("UA-9: a refused access token refreshes without losing the signed-in page", async ({ page }) => {
  const refresh = page.waitForResponse((response) => response.url().endsWith("/api/auth/refresh"));
  await page.evaluate(() => localStorage.setItem("kamoti.token", "expired.or.garbage"));
  await page.goto("/my-reports");
  expect((await refresh).status()).toBe(200);
  await expect(page).toHaveURL(/my-reports/);
  await expect(page.getByRole("heading", { name: "My reports", exact: true })).toBeVisible();
  const token = await page.evaluate(() => localStorage.getItem("kamoti.token"));
  expect(token).toBeTruthy();
  expect(token).not.toBe("expired.or.garbage");
  await captureEvidence(page, "UA-9-refresh-without-mail-desktop.png");
});

test("UA-9, RS-5: idle warning can be dismissed; later sign-out preserves the open report draft", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/report/new");
  await placePinByLocation(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const title = "[TEST] Draft retained after idle sign-out";
  const description = "Synthetic unsent draft for the idle-session check.";
  await page.locator("#title").fill(title);
  await page.locator("#description").fill(description);
  await page.evaluate(() => localStorage.setItem("kamoti.activity", String(Date.now() - 15 * 60_000 - 3_000)));
  await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 5000 });
  await captureEvidence(page, "UA-9-idle-draft-warning-mobile.png");
  await page.getByRole("button", { name: "Stay signed in", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.locator("#title")).toHaveValue(title);
  await page.evaluate(() => localStorage.setItem("kamoti.activity", String(Date.now() - 17 * 60_000)));
  await page.waitForURL(/signin/, { timeout: 5000 });
  await expect(page.getByText("without activity")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("kamoti.token"))).toBeNull();
  const drafts = await page.evaluate(() => Object.keys(sessionStorage)
    .filter((key) => key.startsWith("kamoti.draft.new-report."))
    .map((key) => sessionStorage.getItem(key)));
  expect(drafts).toHaveLength(1);
  const draft = drafts[0];
  expect(draft).toContain(title);
  expect(draft).toContain(description);
  await captureEvidence(page, "UA-9-idle-signout-mobile.png");
  await signIn(page, email, password);
  await page.goto("/report/new");
  await page.getByRole("button", { name: "Restore draft", exact: true }).click();
  await expect(page.locator("#title")).toHaveValue(title);
  await expect(page.locator("#description")).toHaveValue(description);
  await captureEvidence(page, "RS-5-draft-restored-after-signin-mobile.png");
});
