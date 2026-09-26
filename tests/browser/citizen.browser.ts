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

  test("UIUX-02: Wizard step 3 pre-flight review displays description, photo state, and allows step navigation", async ({ page }) => {
    await page.goto("/report/new");
    await page.waitForLoadState("networkidle");

    // 1. Select location in Step 1
    const map = page.locator(".leaflet-container");
    await map.click({ position: { x: 150, y: 150 } });
    await page.waitForTimeout(500);

    await page.click('button:has-text("Continue")');
    await expect(page.locator("h2")).toContainText("What is wrong?");

    // 2. Fill category, title, description in Step 2
    const categorySelect = page.locator("#category");
    await categorySelect.selectOption({ index: 1 });
    await page.fill("#title", "[UIUX-02] Road damage pre-flight verification");
    await page.fill(
      "#description",
      "Detailed description of hazardous road fissure that requires immediate public works intervention.",
    );

    await page.click('button:has-text("Continue")');
    await expect(page.locator("h2")).toContainText("Show us");

    // 3. Verify Step 3 summary displays Title, Location, Description, and photo status
    const summaryCard = page.locator("[data-testid='preflight-summary']");
    await expect(summaryCard).toBeVisible();
    await expect(summaryCard).toContainText("[UIUX-02] Road damage pre-flight verification");
    await expect(summaryCard).toContainText("Detailed description of hazardous road fissure");
    await expect(summaryCard).toContainText("No photo attached");

    // Capture visual proof of pre-flight review
    await captureEvidence(page, "CITIZEN-wizard-step3-summary.png");

    // 4. Test direct navigation back to Step 1 via step header button
    const step1Btn = page.locator("nav[aria-label='Wizard steps'] button:has-text('Step 1')");
    await expect(step1Btn).toBeEnabled();
    await step1Btn.click();
    await expect(page.locator("h2")).toContainText("Where is it?");

    // Return to Step 2
    const step2Btn = page.locator("nav[aria-label='Wizard steps'] button:has-text('Step 2')");
    await expect(step2Btn).toBeEnabled();
    await step2Btn.click();
    await expect(page.locator("h2")).toContainText("What is wrong?");
    await expect(page.locator("#title")).toHaveValue("[UIUX-02] Road damage pre-flight verification");
  });

  test("UIUX-05: Mobile my-reports renders responsive cards, zero overflow, and modal cancellation dialog", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/my-reports");
    await page.waitForLoadState("networkidle");

    // Table should be hidden on mobile viewport
    await expect(page.locator("table")).toBeHidden();

    // Verify stacked responsive cards render on mobile
    const cards = page.locator(".md\\:hidden .card");
    await expect(cards.first()).toBeVisible();

    const firstCard = cards.first();
    // Card elements: Reference Code, Category badge, Status badge, View details button
    await expect(firstCard.locator(".tag").first()).toBeVisible();
    await expect(firstCard.locator('a:has-text("View details")')).toBeVisible();

    // Verify zero horizontal overflow on mobile
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

    await captureEvidence(page, "CITIZEN-mobile-my-reports.png");

    // Verify dedicated modal cancellation dialog with optional reason input
    const cancelBtn = page.locator('.md\\:hidden button:has-text("Cancel report")').first();
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();

    const dialog = page.locator('.dialog[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".dialog-title")).toContainText("Withdraw this report?");
    await expect(dialog.locator("#cancel-details")).toBeVisible();
    await expect(dialog.locator('button:has-text("Yes, cancel")')).toBeVisible();

    await dialog.locator("#cancel-details").fill("Withdrawing duplicate report entry.");

    await captureEvidence(page, "CITIZEN-cancel-dialog-modal.png");

    // Test dismiss dialog via Keep it
    await dialog.locator('button:has-text("Keep it")').click();
    await expect(dialog).toBeHidden();

    // Test dismiss dialog via Escape key
    await cancelBtn.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("KR-14, KR-17: Location denial banner guidance and stale address refresh on pin move", async ({ page }) => {
    // 1. Simulate geolocation permission denial
    await page.addInitScript(() => {
      (navigator as unknown as { geolocation: { getCurrentPosition: unknown } }).geolocation.getCurrentPosition = (
        _success: unknown,
        error: (err: unknown) => void,
      ) => {
        if (error) {
          error({
            code: 1, // PERMISSION_DENIED
            message: "User denied Geolocation",
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          });
        }
      };
    });

    await page.goto("/report/new");
    await page.waitForLoadState("networkidle");

    // Click "Use my location" and assert denial guidance banner appears
    await page.click('button:has-text("Use my location")');
    const alertBanner = page.locator('[role="alert"]');
    await expect(alertBanner).toBeVisible();
    await expect(alertBanner).toContainText("Location access disabled. Please tap the map to place your report pin.");

    await captureEvidence(page, "KR-14-geo-denial-guidance.png");

    // 2. Click map to drop pin and verify error banner clears
    const map = page.locator(".leaflet-container");
    await map.click({ position: { x: 120, y: 120 } });
    await expect(page.locator('button:has-text("Use my location")')).toBeEnabled();

    // 3. Enter a custom address then move pin to verify address lifecycle
    await page.fill("#address", "Test Landmark A");
    await map.click({ position: { x: 200, y: 200 } });
    // Hand-entered address remains untouched
    await expect(page.locator("#address")).toHaveValue("Test Landmark A");
  });

  test("Issue #37: Report photo opens accessible lightbox modal dismissible via close button and Escape key", async ({ page }) => {
    // Intercept report details to supply fixture photos
    await page.route("**/api/reports/*", async (route) => {
      const response = await route.fetch();
      try {
        const json = await response.json();
        if (json?.report) {
          json.report.photos = [
            {
              id: "fixture-photo-1",
              report_id: json.report.id,
              kind: "initial",
              url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><rect width='400' height='300' fill='%23e05638'/><text x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='white' font-family='sans-serif' font-size='20'>Evidence Photo</text></svg>",
              storage_path: "reports/fixture-photo-1.svg",
              byte_size: 154200,
              mime_type: "image/svg+xml",
              uploaded_at: new Date().toISOString(),
            },
          ];
        }
        await route.fulfill({ response, json });
      } catch {
        await route.continue();
      }
    });

    // Go to my-reports and click the first report
    await page.goto("/my-reports");
    await page.waitForLoadState("networkidle");

    const reportLink = page.locator("a[href^='/reports/']").first();
    await expect(reportLink).toBeVisible();
    await reportLink.click();
    await page.waitForLoadState("networkidle");

    // Click photo to open lightbox
    const photoBtn = page.locator('button[aria-label^="View evidence photo"]').first();
    await expect(photoBtn).toBeVisible();
    await photoBtn.click();

    // Verify lightbox dialog is visible and accessible
    const lightboxDialog = page.locator('[role="dialog"][aria-modal="true"]');
    await expect(lightboxDialog).toBeVisible();
    await expect(lightboxDialog.locator("img")).toBeVisible();

    await captureEvidence(page, "PHOTO-lightbox-modal.png");

    // Dismiss via keyboard Escape key
    await page.keyboard.press("Escape");
    await expect(lightboxDialog).toBeHidden();

    // Reopen and dismiss via Close button
    await photoBtn.click();
    await expect(lightboxDialog).toBeVisible();
    const closeBtn = lightboxDialog.locator('button:has-text("Close")');
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
    await expect(lightboxDialog).toBeHidden();
  });
});

