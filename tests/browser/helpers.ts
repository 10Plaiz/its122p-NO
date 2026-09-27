import type { Page } from "@playwright/test";

export const FIXTURE_PASSWORD = process.env.FIXTURE_PASSWORD ?? "Password123!";

export const USERS = {
  admin: "fixture-admin@kamoti.invalid",
  citizen1: "fixture-citizen-1@kamoti.invalid",
  citizen2: "fixture-citizen-2@kamoti.invalid",
  staff1: "fixture-staff-1@kamoti.invalid",
  staff2: "fixture-staff-2@kamoti.invalid",
} as const;

// What the tests write to the database. cleanup.ts deletes exactly these after every
// run, so keep the tests and the cleanup on these two constants.
export const TEST_TITLE_PREFIX = "[TEST]";
export const TEST_REMARK = "Staff on-site assessment complete. Scheduled for follow-up review.";

export async function signIn(page: Page, email: string, password = FIXTURE_PASSWORD) {
  await page.goto("/signin");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForLoadState("networkidle");
}

export async function signOut(page: Page) {
  const signOutBtn = page.locator('button:has-text("Sign out")');
  if (await signOutBtn.isVisible()) {
    await signOutBtn.click();
    await page.waitForLoadState("networkidle");
  }
}

// Screenshots land in tests/evidence/ unless EVIDENCE_DIR names another folder, so a
// run against a different target can keep its set apart from the committed one.
const EVIDENCE_DIR = process.env.EVIDENCE_DIR ?? "tests/evidence";

export async function captureEvidence(page: Page, filename: string) {
  await page.screenshot({
    path: `${EVIDENCE_DIR}/${filename}`,
    fullPage: true,
  });
}
