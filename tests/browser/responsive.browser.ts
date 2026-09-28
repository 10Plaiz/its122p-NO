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

    // On desktop, mobile segmented toggle is hidden; map and list both render side by side
    await expect(page.locator('[data-testid="mobile-view-toggle"]')).toBeHidden();
    await expect(page.locator('[data-testid="board-map-container"]')).toBeVisible();
    await expect(page.locator('[data-testid="board-list-container"]')).toBeVisible();

    await captureEvidence(page, "FUNC-12-desktop-board.png");
  });

  test("UIUX-03: Mobile board (375x812) toggles between List View and Map View without overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/board");
    await page.waitForLoadState("networkidle");

    const toggle = page.locator('[data-testid="mobile-view-toggle"]');
    await expect(toggle).toBeVisible();

    const mapContainer = page.locator('[data-testid="board-map-container"]');
    const listContainer = page.locator('[data-testid="board-list-container"]');

    // Default on mobile is List View: map is hidden, list is visible
    await expect(mapContainer).toBeHidden();
    await expect(listContainer).toBeVisible();
    await captureEvidence(page, "BOARD-mobile-list.png");

    // Toggle to Map View
    const mapRadio = page.locator('[data-testid="mobile-view-map"]');
    await mapRadio.click();

    // Map becomes visible, list is hidden
    await expect(mapContainer).toBeVisible();
    await expect(listContainer).toBeHidden();
    await captureEvidence(page, "BOARD-mobile-map.png");

    // Verify absence of horizontal overflow on mobile
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

    // Toggle back to List View
    const listRadio = page.locator('[data-testid="mobile-view-list"]');
    await listRadio.click();
    await expect(mapContainer).toBeHidden();
    await expect(listContainer).toBeVisible();
  });

  test("UIUX-06: Board pagination sits flush right under the list, and the page ends at the footer", async ({ page }) => {
    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 375, height: 812 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/board");
      await page.waitForLoadState("networkidle");

      // The map-view bounds filter was removed; nothing should offer it.
      await expect(page.getByText("Only show reports in this map view")).toHaveCount(0);

      const next = page.getByRole("button", { name: "Next" });
      test.skip((await next.count()) === 0, "No public reports on this environment to page.");

      const list = await page.locator('[data-testid="board-list-container"]').boundingBox();
      const pager = await next.locator("xpath=..").boundingBox();
      expect(list && pager).toBeTruthy();
      // Below the list, and its right edge lined up with the list's.
      expect(pager!.y).toBeGreaterThanOrEqual(list!.y + list!.height);
      expect(Math.abs(pager!.x + pager!.width - (list!.x + list!.width))).toBeLessThanOrEqual(1);

      // Regression: the cards' absolutely positioned sr-only text once escaped the
      // list's scroll box and stretched the page thousands of pixels past the footer.
      const overshoot = await page.evaluate(() => {
        const footer = document.querySelector("footer")!.getBoundingClientRect();
        return document.documentElement.scrollHeight - (footer.bottom + window.scrollY);
      });
      expect(overshoot).toBeLessThanOrEqual(1);
    }
  });

  test("KR-21: The mobile pane survives a reload", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/board");
    await page.waitForLoadState("networkidle");

    // Choosing Map writes `pane` to the URL.
    await page.locator('[data-testid="mobile-view-map"]').click();
    await expect(page).toHaveURL(/[?&]pane=map/);

    // A shared or reloaded link opens on the pane it was left on.
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-testid="board-map-container"]')).toBeVisible();
    await expect(page.locator('[data-testid="board-list-container"]')).toBeHidden();
  });
});
