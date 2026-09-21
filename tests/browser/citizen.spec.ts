import { test, expect } from "@playwright/test";
import { captureEvidence, FIXTURE_PASSWORD, signIn, USERS } from "./helpers.js";

test.describe("Citizen functional workflows (FUNC-01, FUNC-04, FUNC-05)", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await signIn(page, USERS.citizen1, FIXTURE_PASSWORD);
  });

  test("FUNC-01b: Report creation rejects missing map pin location", async ({ page }) => {
    await page.goto("/report/new");
    await page.waitForLoadState("networkidle");

    // Attempting to proceed without dropping a pin
    await page.click('button:has-text("Continue")');
    await expect(page.locator('[role="alert"]')).toContainText("Tap the map to drop a pin");

    await captureEvidence(page, "FUNC-01b-coordinate-error.png");
  });

  test("FUNC-01a, FUNC-04, FUNC-05: Complete citizen report lifecycle", async ({ page }) => {
    // 1. Create Report (FUNC-01a)
    await page.goto("/report/new");
    await page.waitForLoadState("networkidle");

    // Tap on the map to set a point
    const map = page.locator(".leaflet-container");
    await map.click({ position: { x: 150, y: 150 } });
    await page.waitForTimeout(500);

    // Proceed to Step 1
    await page.click('button:has-text("Continue")');
    await expect(page.locator("h2")).toContainText("What is wrong?");

    // Fill form
    const categorySelect = page.locator("#category");
    await categorySelect.selectOption({ index: 1 });

    await page.fill("#title", "[TEST] Phase 4 automated verification report");
    await page.fill(
      "#description",
      "Automated functional testing verifying report submission, editing, and cancellation lifecycle.",
    );

    // Proceed to Step 2
    await page.click('button:has-text("Continue")');
    await expect(page.locator("h2")).toContainText("Show us");

    await captureEvidence(page, "FUNC-01a-report-create.png");

    // Submit report
    await page.click('button:has-text("Submit report")');
    await expect(page).toHaveURL(/.*reports\/[a-f0-9-]+/);

    // 2. Edit Pending Report (FUNC-04)
    const editBtn = page.locator('button:has-text("Edit report")');
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    await expect(page.locator("h3")).toContainText("Edit pending report");
    await page.fill("#edit-title", "[TEST] Phase 4 automated verification report (Updated)");
    await captureEvidence(page, "FUNC-04-edit-pending.png");

    await page.click('button:has-text("Save changes")');
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h2")).toContainText("[TEST] Phase 4 automated verification report (Updated)", { timeout: 15000 });

    // 3. Cancel Report (FUNC-05)
    await page.goto("/my-reports");
    await page.waitForLoadState("networkidle");

    const firstCancelBtn = page.locator('button:has-text("Cancel report")').first();
    await expect(firstCancelBtn).toBeVisible();
    await firstCancelBtn.click();

    await expect(page.locator("body")).toContainText("Withdraw this report?");
    await captureEvidence(page, "FUNC-05-cancelled-report.png");

    await page.click('button:has-text("Yes, cancel")');
    await page.waitForTimeout(1000);
  });
});
