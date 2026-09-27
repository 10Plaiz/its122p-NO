import { test, expect } from "@playwright/test";
import { captureEvidence, FIXTURE_PASSWORD, signIn, signOut, TEST_REMARK, USERS } from "./helpers.js";

test.describe("Staff functional workflows (FUNC-02, FUNC-03, FUNC-06, FUNC-07)", () => {
  test("FUNC-02: A resolved report's history shows every status step", async ({ page }) => {
    // Advancing a fixture report would change shared data for good, so the evidence
    // is a report that has already travelled the whole workflow.
    await page.context().clearCookies();
    await signIn(page, USERS.admin, FIXTURE_PASSWORD);

    await page.goto("/admin/reports");
    await page.waitForLoadState("networkidle");
    await page.selectOption("#status", "resolved");
    await page.waitForLoadState("networkidle");

    const firstRow = page.locator("table tbody tr").first();
    await expect(firstRow).toContainText("Resolved");
    await firstRow.locator("td a").first().click();
    await page.waitForLoadState("networkidle");

    const history = page.locator("section:has(h6:text-is('History'))");
    await expect(history).toContainText("Pending → Under review");
    await expect(history).toContainText("Under review → In progress");
    await expect(history).toContainText("In progress → Resolved");
    // Photos load after the page; wait so the screenshot does not show empty frames.
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll("main img:not(.leaflet-tile):not(.leaflet-marker-icon)")).every((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0),
    );
    await captureEvidence(page, "FUNC-02-status-progression.png");
  });

  test("FUNC-03, FUNC-07: Staff sees only the next legal status and records a remark", async ({ page }) => {
    await page.context().clearCookies();
    await signIn(page, USERS.staff1, FIXTURE_PASSWORD);

    await page.goto("/staff/queue");
    await page.waitForLoadState("networkidle");

    // Open first assigned report in queue
    const reportLink = page.locator("table tbody tr td a").first();
    await expect(reportLink).toBeVisible();
    await reportLink.click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h2")).toBeVisible();

    // FUNC-03: the panel offers exactly one move, the next stage. The server-side
    // rejection of skips and terminal moves is covered by the fast suite.
    const nextStep = page.locator("section:has(h6:text-is('Next step'))");
    await expect(nextStep).toContainText("→");
    await expect(nextStep.locator('button[type="submit"], button[type="button"]')).toHaveCount(1);
    await captureEvidence(page, "FUNC-03-only-next-step-offered.png");

    // FUNC-07: the remark is saved and appears in the history.
    // Count first: an earlier run's remark may still be listed, and must not satisfy this.
    const history = page.locator("section:has(h6:text-is('History'))");
    const remarks = history.getByText(TEST_REMARK, { exact: true });
    const before = await remarks.count();

    const remarkField = page.locator("#remark");
    await expect(remarkField).toBeVisible();
    await remarkField.fill(TEST_REMARK);
    await page.click('button:has-text("Save remark")');
    await expect(remarks).toHaveCount(before + 1, { timeout: 15000 });
    await expect(page.locator('button:has-text("Save remark")')).toBeVisible();
    await captureEvidence(page, "FUNC-07-staff-remark.png");
  });

  test("FUNC-06: Unassigned staff cannot open another staff member's report", async ({ page }) => {
    // 1. Get assigned report ID as staff 1
    await page.context().clearCookies();
    await signIn(page, USERS.staff1, FIXTURE_PASSWORD);
    await page.goto("/staff/queue");
    await page.waitForLoadState("networkidle");

    const reportLink = page.locator("table tbody tr td a").first();
    const href = await reportLink.getAttribute("href");
    expect(href).toBeTruthy();

    await signOut(page);

    // 2. Staff 2 is not assigned, so the API refuses the read and no controls render.
    await signIn(page, USERS.staff2, FIXTURE_PASSWORD);
    await page.goto(href!);
    await page.waitForLoadState("networkidle");

    await expect(page.locator('[role="alert"]')).toContainText("Could not open this report");
    await expect(page.locator("#remark")).toHaveCount(0);
    await captureEvidence(page, "FUNC-06-unassigned-staff-denied.png");
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

    await expect(page.locator('a[href^="sms:"]')).toHaveCount(0);

    await captureEvidence(page, "KR-23-call-only-mobile.png");
  });
});
