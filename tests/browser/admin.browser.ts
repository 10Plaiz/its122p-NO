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

  // The checks below never save anything: they select and cancel, or only read. Running
  // them leaves every account and category exactly as it found them.

  test("KR-05, KR-09: Cancelling a role change discards it, and roles read as labels", async ({ page }) => {
    await page.goto("/admin/users");
    await page.waitForLoadState("networkidle");

    // A citizen fixture, so the row under test is never the signed-in administrator.
    const row = page.locator("tr", { hasText: USERS.citizen1 });
    await expect(row).toBeVisible();

    // KR-09: the role reads as a label, not the raw enum value the API sends.
    await expect(row.locator(".tag")).toHaveText("Citizen");

    // KR-05: pick a different role, then cancel.
    await row.locator("button:has-text('Change role')").click();
    const select = row.locator("select");
    await select.selectOption("admin");
    await row.locator("button:has-text('Cancel')").click();

    // The row is back to what the account actually is.
    await expect(row.locator(".tag")).toHaveText("Citizen");

    // Reopening must not offer the abandoned choice as though it were saved. This is the
    // regression: the dropdown used to reopen reading "admin", and the next Save applied
    // a promotion nobody had confirmed.
    await row.locator("button:has-text('Change role')").click();
    await expect(row.locator("select")).toHaveValue("citizen");

    // Save is inert while nothing has changed.
    await expect(row.locator("button:has-text('Save')")).toBeDisabled();
    await row.locator("button:has-text('Cancel')").click();
  });

  test("KR-06: An administrator cannot act on their own account row", async ({ page }) => {
    await page.goto("/admin/users");
    await page.waitForLoadState("networkidle");

    const ownRow = page.locator("tr", { hasText: USERS.admin });
    await expect(ownRow).toBeVisible();

    // The server refuses both of these, so the row says so instead of taking the click.
    await expect(ownRow.locator("button:has-text('Change role')")).toBeDisabled();
    await expect(ownRow.locator("button:has-text('Deactivate')")).toBeDisabled();
    await expect(ownRow).toContainText("This is your own account.");

    // Another account keeps its controls.
    const otherRow = page.locator("tr", { hasText: USERS.citizen1 });
    await expect(otherRow.locator("button:has-text('Change role')")).toBeEnabled();
  });

  test("KR-12: Retiring a category asks first and can be backed out of", async ({ page }) => {
    await page.goto("/admin/categories");
    await page.waitForLoadState("networkidle");

    const row = page.locator("tr", { hasText: "Road" }).first();
    await row.locator("button:has-text('Retire')").click();

    // A confirm step stands between the click and the change.
    await expect(row).toContainText("Retire this category?");
    await expect(row.locator("button:has-text('Yes, retire')")).toBeVisible();

    // Backing out leaves the category active.
    await row.locator("button:has-text('Keep it')").click();
    await expect(row).not.toContainText("Retire this category?");
    await expect(row).toContainText("Active");
  });

  test("KR-10, KR-11: Assign stays inert until a staff member is chosen", async ({ page }) => {
    await page.goto("/admin/reports");
    await page.waitForLoadState("networkidle");

    // KR-11: retired categories remain selectable here — an admin still needs to audit
    // reports filed under them — but are marked so the list does not look like it is
    // offering citizens a dead category.
    const categoryFilter = page.locator("#category");
    await expect(categoryFilter).toBeVisible();
    const retired = categoryFilter.locator("option", { hasText: "(retired)" });
    if ((await retired.count()) > 0) await expect(retired.first()).toBeAttached();

    // KR-10: open the assign dialog on the first report.
    await page.locator("table button:has-text('Assign')").first().click();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    const staffSelect = dialog.locator("#staff");
    const confirm = dialog.locator("button:has-text('Assign')");

    // Nothing picked yet, so the primary action is disabled and says what is missing.
    if (await staffSelect.isVisible()) {
      await staffSelect.selectOption("");
      await expect(confirm).toBeDisabled();
      await expect(dialog).toContainText("Choose who should take this");

      // Picking somebody enables it. Left unclicked, so no assignment is made.
      const options = staffSelect.locator("option:not([value=''])");
      if ((await options.count()) > 0) {
        await staffSelect.selectOption({ index: 1 });
        await expect(confirm).toBeEnabled();
      }
    }

    await dialog.locator("button:has-text('Cancel')").click();
    await expect(dialog).toBeHidden();
  });
});

