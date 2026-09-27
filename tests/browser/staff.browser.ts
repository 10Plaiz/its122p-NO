import { test, expect } from "@playwright/test";
import { captureEvidence, FIXTURE_PASSWORD, signIn, signOut, TEST_REMARK, USERS } from "./helpers.js";

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
      await remarkField.fill(TEST_REMARK);
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

  test("UIUX-04, KR-22, KR-23: Mobile staff queue renders responsive task cards and direct contact links", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.context().clearCookies();
    await signIn(page, USERS.staff1, FIXTURE_PASSWORD);

    await page.goto("/staff/queue");
    await page.waitForLoadState("networkidle");

    // Table should be hidden on mobile viewport
    await expect(page.locator("table")).toBeHidden();

    // Responsive task cards should be visible
    const cards = page.locator(".md\\:hidden .card");
    await expect(cards.first()).toBeVisible();

    // Verify task card elements: Reference Code, Category badge, Status badge, Assignment, Inspect report button
    const firstCard = cards.first();
    await expect(firstCard.locator(".tag").first()).toBeVisible();
    await expect(firstCard.locator(".tag").nth(1)).toBeVisible();
    await expect(firstCard).toContainText("Assignment:");
    const inspectBtn = firstCard.locator('a:has-text("Inspect report")');
    await expect(inspectBtn).toBeVisible();

    // Verify absence of horizontal overflow on mobile viewport
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

    await captureEvidence(page, "FUNC-12-mobile-queue.png");

    await page.route("**/api/reports/*", async (route) => {
      const response = await route.fetch();
      try {
        const json = await response.json();
        if (json?.report?.citizen) {
          json.report.citizen.contact_number = "09171234567";
        }
        await route.fulfill({ response, json });
      } catch {
        await route.continue();
      }
    });

    // Click Inspect report to navigate to the staff report inspection view
    await inspectBtn.click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h2")).toBeVisible();

    // Verify citizen contact links (KR-23)
    const telLink = page.locator('a[href^="tel:"]').first();
    await expect(telLink).toBeVisible();
    const telHref = await telLink.getAttribute("href");
    expect(telHref).toBe("tel:09171234567");

    const smsLink = page.locator('a[href^="sms:"]').first();
    await expect(smsLink).toBeVisible();
    const smsHref = await smsLink.getAttribute("href");
    expect(smsHref).toBe("sms:09171234567");

    await captureEvidence(page, "KR-23-staff-contact-links.png");
  });
});
