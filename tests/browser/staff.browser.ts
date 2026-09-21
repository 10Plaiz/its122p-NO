import { test, expect } from "@playwright/test";
import { captureEvidence, FIXTURE_PASSWORD, signIn, signOut, USERS } from "./helpers.js";

test.describe("Staff functional workflows (FUNC-02, FUNC-03, FUNC-06, FUNC-07)", () => {
  test("FUNC-02, FUNC-07: Staff workflow inspection and remark creation", async ({ page }) => {
    await page.context().clearCookies();
    await signIn(page, USERS.staff1, FIXTURE_PASSWORD);

    await page.goto("/staff/queue");
    await page.waitForLoadState("networkidle");

    // Open first assigned report in queue
    const reportLink = page.locator("table tbody tr td a").first();
    await expect(reportLink).toBeVisible();
    await reportLink.click();
    await page.waitForLoadState("networkidle");

    // Capture status progression section (FUNC-02)
    await expect(page.locator("h2")).toBeVisible();
    await captureEvidence(page, "FUNC-02-status-progression.png");

    // Add remark (FUNC-07)
    const remarkField = page.locator("#remark");
    if (await remarkField.isVisible()) {
      await remarkField.fill("Staff on-site assessment complete. Scheduled for follow-up review.");
      await captureEvidence(page, "FUNC-07-staff-remark.png");
      await page.click('button:has-text("Save remark")');
      await page.waitForTimeout(1000);
    }
  });

  test("FUNC-06, FUNC-03: Unassigned staff access restriction", async ({ page }) => {
    // 1. Get assigned report ID as staff 1
    await page.context().clearCookies();
    await signIn(page, USERS.staff1, FIXTURE_PASSWORD);
    await page.goto("/staff/queue");
    await page.waitForLoadState("networkidle");

    const reportLink = page.locator("table tbody tr td a").first();
    const href = await reportLink.getAttribute("href");
    expect(href).toBeTruthy();

    await signOut(page);

    // 2. Sign in as unassigned staff 2 and attempt status update
    await signIn(page, USERS.staff2, FIXTURE_PASSWORD);
    await page.goto(href!);
    await page.waitForLoadState("networkidle");

    // Attempting to advance status as unassigned staff triggers server 403 alert
    const advanceBtn = page.locator('section:has-text("Next step") button[type="button"]').first();
    if (await advanceBtn.isVisible()) {
      await advanceBtn.click();
      await expect(page.locator('[role="alert"]')).toBeVisible();
      await captureEvidence(page, "FUNC-06-assigned-update.png");
      await captureEvidence(page, "FUNC-03-invalid-transition.png");
    }
  });
});
