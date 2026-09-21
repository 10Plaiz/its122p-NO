import { test, expect } from "@playwright/test";
import { captureEvidence, FIXTURE_PASSWORD, signIn, USERS } from "./helpers.js";

test.describe("Administrator features (FUNC-09 and FUNC-10)", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await signIn(page, USERS.admin, FIXTURE_PASSWORD);
  });

  test("FUNC-09: Admin analytics dashboard renders metrics and captures evidence", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h2")).toContainText("Dashboard");
    await expect(page.locator("body")).toContainText("Total reports");
    await expect(page.locator("body")).toContainText("Resolved");

    await captureEvidence(page, "FUNC-09-admin-analytics.png");
  });

  test("FUNC-10: Category management renders categories and captures evidence", async ({ page }) => {
    await page.goto("/admin/categories");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h2")).toContainText("Categories");
    await expect(page.locator("table")).toBeVisible();

    await captureEvidence(page, "FUNC-10-category-management.png");
  });
});
