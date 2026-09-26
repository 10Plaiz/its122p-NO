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

  test("UIUX-01: Admin navigation consolidation and persistent sub-tabs across viewports", async ({ page }) => {
    // Desktop viewport: verify single Admin link in global header and sub-tabs
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    // Global header should contain single Admin link (not separate flat links)
    const headerNav = page.locator("header nav#main-menu");
    await expect(headerNav.locator("a:has-text('Admin')")).toBeVisible();
    await expect(headerNav.locator("a:has-text('Categories')")).toBeHidden();

    // Persistent secondary tabs should be visible
    const subNav = page.locator("nav[aria-label='Admin navigation tabs']");
    await expect(subNav).toBeVisible();
    await expect(subNav.locator("a:has-text('Dashboard')")).toBeVisible();
    await expect(subNav.locator("a:has-text('Reports')")).toBeVisible();
    await expect(subNav.locator("a:has-text('Users')")).toBeVisible();
    await expect(subNav.locator("a:has-text('Categories')")).toBeVisible();
    await expect(subNav.locator("a:has-text('Activity')")).toBeVisible();

    await captureEvidence(page, "ADMIN-header-desktop.png");

    // Click secondary tab and verify navigation
    await subNav.locator("a:has-text('Reports')").click();
    await page.waitForURL(/\/admin\/reports/);
    await expect(page.locator("h2")).toContainText("All reports");
    await expect(subNav.locator("a:has-text('Reports')")).toHaveClass(/border-accent/);

    // Tablet viewport: verify header remains clean and un-wrapped
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    await expect(headerNav.locator("a:has-text('Admin')")).toBeVisible();
    await expect(subNav).toBeVisible();

    await captureEvidence(page, "ADMIN-header-tablet.png");
  });

  test("KR-10: Admin report assignment button is disabled until a staff member is selected", async ({ page }) => {
    await page.goto("/admin/reports");
    await page.waitForLoadState("networkidle");

    // Click Assign button on first available report row
    const assignTrigger = page.locator('table tbody tr button:has-text("Assign")').first();
    if (await assignTrigger.isVisible()) {
      await assignTrigger.click();

      // Assign dialog should open
      const dialog = page.locator('.dialog[role="dialog"]');
      await expect(dialog).toBeVisible();

      // Submit button should be disabled when select is empty
      const select = dialog.locator("select#staff");
      await select.selectOption("");
      const submitBtn = dialog.locator('button[type="button"]:has-text("Assign")');
      await expect(submitBtn).toBeDisabled();

      // When a staff member is selected, submit button becomes enabled
      const options = await select.locator("option").all();
      if (options.length > 1) {
        const optionValue = await options[1].getAttribute("value");
        if (optionValue) {
          await select.selectOption(optionValue);
          await expect(submitBtn).toBeEnabled();
        }
      }

      // Close dialog
      await dialog.locator('button:has-text("Cancel")').click();
      await expect(dialog).toBeHidden();
    }
  });
});

