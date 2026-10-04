import { test, expect } from "@playwright/test";
import {
  apiToken,
  bearer,
  captureEvidence,
  FIXTURE_PASSWORD,
  MAKATI_POINT,
  signIn,
  signOut,
  TEST_REMARK,
  TEST_TITLE_PREFIX,
  USERS,
} from "./helpers.js";

// A 1x1 PNG, enough for a proof-of-repair upload.
const PROOF_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test.describe("Staff functional workflows (FUNC-02, FUNC-03, FUNC-06, FUNC-07)", () => {
  test("FUNC-02, SW-4: staff request resolution, an administrator verifies it, and the history shows every step", async ({ page, request }) => {
    // Set-up through the API on a [TEST] report this run owns (cleanup.ts removes
    // it): a citizen files it, an administrator assigns staff 1 and moves it to in
    // progress, and staff 1 uploads proof of repair. The two steps this test is
    // about, the request and the verification, are done in the browser.
    const citizen = await apiToken(request, USERS.citizen1);
    const admin = await apiToken(request, USERS.admin);
    const staff = await apiToken(request, USERS.staff1);

    const categories = (await (await request.get("/api/categories")).json()).categories as { id: number; is_active: boolean }[];
    const category = categories.find((c) => c.is_active)!;
    const groups = (await (await request.get("/api/reports/meta/problem-types", { headers: bearer(citizen) })).json()).groups as {
      category_id: number;
      problem_types: { id: number }[];
    }[];
    const problem = groups.find((g) => g.category_id === category.id)!.problem_types[0]!;
    const title = `${TEST_TITLE_PREFIX} Resolution request and verification`;
    const created = await request.post("/api/reports", {
      headers: bearer(citizen),
      data: { title, description: "Automated check of the request and verification flow.", category_id: category.id, primary_problem_id: problem.id, ...MAKATI_POINT },
    });
    expect(created.status()).toBe(201);
    const reportId = ((await created.json()) as { report: { id: string } }).report.id;

    const staffList = (await (await request.get("/api/staff", { headers: bearer(admin) })).json()).staff as { id: string; email: string }[];
    const staffId = staffList.find((s) => s.email === USERS.staff1)!.id;
    for (const [path, data] of [
      [`/api/reports/${reportId}/assign`, { staff_id: staffId, details: "Nearest crew." }],
      [`/api/reports/${reportId}/status`, { status: "under_review", details: "Checked the photos." }],
      [`/api/reports/${reportId}/status`, { status: "in_progress", details: "Crew dispatched." }],
    ] as const) {
      expect((await request.patch(path, { headers: bearer(admin), data })).ok(), path).toBe(true);
    }
    const upload = await request.post(`/api/reports/${reportId}/photos`, {
      headers: bearer(staff),
      multipart: { photo: { name: "proof.png", mimeType: "image/png", buffer: PROOF_PNG } },
    });
    expect(upload.status()).toBe(201);

    // Staff 1 asks for verification in the workbench.
    await page.context().clearCookies();
    await signIn(page, USERS.staff1, FIXTURE_PASSWORD);
    await page.goto(`/staff/reports/${reportId}`);
    await page.fill("#closure-details", "Patched the pothole and compacted the asphalt.");
    await page.getByRole("button", { name: "Request resolution" }).click();
    await expect(page.getByText("Waiting for verification")).toBeVisible();
    await expect(page.getByText("Awaiting verification", { exact: true })).toBeVisible();
    await signOut(page);

    // The administrator approves it.
    await signIn(page, USERS.admin, FIXTURE_PASSWORD);
    await page.goto(`/staff/reports/${reportId}`);
    await expect(page.getByRole("heading", { name: "Verify resolution" })).toBeVisible();
    await page.fill("#verify-comment", "Photo shows the repair. Approved.");
    await page.getByRole("button", { name: "Approve and close as resolved" }).click();

    const history = page.locator("section:has(h6:text-is('History'))");
    await expect(history).toContainText("Pending → Under review", { timeout: 15000 });
    await expect(history).toContainText("Under review → In progress");
    await expect(history).toContainText("Resolution requested");
    await expect(history).toContainText("In progress → Resolved");
    await expect(page.getByText("Resolved", { exact: true }).first()).toBeVisible();
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
