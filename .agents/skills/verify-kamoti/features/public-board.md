# Feature Map: Public Transparency Board

Route: `/board`
Persona: Public Visitor / Citizen

## Sub-features
- **Public Report Feed:** Chronological cards displaying reviewed public issues with status tags and thumbnail photos.
- **Filter and Search Bar:** Status, category, barangay, and search persist in URL parameters. The initial status is Under review. Each dropdown option counts every result page with the other filters applied. `status=all` preserves an explicit Any status selection on reload; Clear filters also uses that value. Loading or failed counts do not appear as zero, and Retry counts leaves the list usable.
- **Interactive Map:** Google map of Makati with the city outline and one square pin per report, coloured by status (resolved: green with a check; rejected: dark with a cross), synchronized with the selected card.
- **Mobile Segmented View:** Responsive toggle switching between Map view and List view on viewports under 1024px (`[data-testid="mobile-view-toggle"]`).
- **Card Expansion:** Clicking a card button expands detailed notes, photo thumbnail, and highlights corresponding map marker.

## How to get to it (user POV)
1. Navigate to `/` as an unauthenticated visitor.
2. Click "Browse community board" or select "Community board" from the top navigation.
3. The board initially displays `under_review`. Visitors can select `in_progress`, `resolved`, `rejected`, or Any status. Pending reports remain private and PII is scrubbed.

## Driving it with Playwright

```typescript
import { test, expect } from "@playwright/test";
import { captureEvidence } from "./helpers.js";

test("Public Board: Browsing, filtering, and responsive toggle", async ({ page }) => {
  // Mobile test
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/board");
  await page.waitForLoadState("networkidle");

  // Verify header and report list
  await expect(page.locator("h2, h1")).toContainText("Public transparency board");
  
  // Capture mobile baseline
  await captureEvidence(page, "BOARD-mobile-list.png");

  // Desktop test
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/board");
  await page.waitForLoadState("networkidle");

  // Filter by category using id selector
  const categorySelect = page.locator("#category");
  if (await categorySelect.isVisible()) {
    await categorySelect.selectOption({ index: 1 });
    await page.waitForLoadState("networkidle");
  }

  await captureEvidence(page, "BOARD-desktop-filtered.png");
});
```

## Gotchas
- **Mobile Pane:** The query parameter `pane=map` controls the mobile segmented toggle between map and list views. The board has no map-bounds filter; `view=map` is ignored.
- **Map Pane Refit:** Hiding the map drops its container to zero dimensions, so the map refits to the reports when its pane is shown again.
- **Category Dropdown Selector:** The category filter input renders with `id="category"`. Do not use `name="category"` in automation scripts.
- **Inline Card Expansion:** Clicking a card toggles inline expansion with `aria-expanded` state. It does not navigate to a new route.
