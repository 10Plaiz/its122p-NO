import { test, expect } from "@playwright/test";
import { captureEvidence } from "./helpers.js";

test.describe("Responsive Viewport Validation (FUNC-12)", () => {
  test("FUNC-12: Mobile viewport (375x812) renders navigation toggle and mobile layout", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // The nav toggle button should be visible on mobile
    const toggle = page.locator("button.nav-toggle");
    await expect(toggle).toBeVisible();

    // Open the mobile menu
    await toggle.click();
    await expect(page.locator("#main-menu")).toBeVisible();

    await captureEvidence(page, "FUNC-12-mobile-nav.png");
  });

  test("FUNC-12: Tablet viewport (768x1024) renders tablet layout", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/board");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h2, h1")).toContainText("Public transparency board");
    await captureEvidence(page, "FUNC-12-tablet-board.png");
  });

  test("FUNC-12: Desktop viewport (1280x800) renders full desktop layout", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/board");
    await page.waitForLoadState("networkidle");

    // On desktop, nav toggle should be hidden and navigation inline
    await expect(page.locator("button.nav-toggle")).toBeHidden();
    await expect(page.locator("#main-menu")).toBeVisible();

    await captureEvidence(page, "FUNC-12-desktop-report.png");
  });
});
