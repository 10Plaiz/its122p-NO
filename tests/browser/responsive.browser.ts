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

  test("KR-02: Returning to List View with the map-view filter on still lists reports", async ({ page }) => {
    // Regression for the empty-list bug. Hiding the map drops its container to 0x0, and
    // Leaflet's invalidateSize() fires `moveend` for that size change. Publishing bounds
    // from a collapsed map handed the board a box where north equalled south, which
    // filtered out every report in the list the visitor had just switched to.
    await page.setViewportSize({ width: 375, height: 812 });

    // `view=map` is the bounds filter (the checkbox), not the pane toggle.
    await page.goto("/board?view=map");
    await page.waitForLoadState("networkidle");

    const listContainer = page.locator('[data-testid="board-list-container"]');
    const cards = listContainer.locator("button[aria-expanded]");

    // Nothing to prove if the environment has no public reports.
    const initialCount = await cards.count();
    test.skip(initialCount === 0, "No public reports on this environment to filter.");

    await expect(page.locator('[data-testid="mobile-view-toggle"] input[value="map"]')).toBeChecked({
      checked: false,
    });

    // Out to the map and back again.
    await page.locator('[data-testid="mobile-view-map"]').click();
    await expect(page.locator('[data-testid="board-map-container"]')).toBeVisible();

    await page.locator('[data-testid="mobile-view-list"]').click();
    await expect(listContainer).toBeVisible();

    // The map auto-fits to the reports it was given, so its last real viewport contains
    // them: the list must still have rows, and must not be showing its empty state.
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(0);
    await expect(page.locator("body")).not.toContainText("Nothing matches those filters");
  });

  test("KR-21: The mobile pane survives a reload, and is not the same thing as view=map", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/board");
    await page.waitForLoadState("networkidle");

    // Choosing Map writes `pane`, leaving the `view` bounds filter untouched.
    await page.locator('[data-testid="mobile-view-map"]').click();
    await expect(page).toHaveURL(/[?&]pane=map/);
    await expect(page).not.toHaveURL(/[?&]view=map/);

    // A shared or reloaded link opens on the pane it was left on.
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-testid="board-map-container"]')).toBeVisible();
    await expect(page.locator('[data-testid="board-list-container"]')).toBeHidden();
  });
});
