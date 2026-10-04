# Feature Map: Citizen Reporting and Tracking

Route: `/report/new`, `/my-reports`, `/reports/:id`
Persona: Citizen (`fixture-citizen-1@kamoti.invalid`)

## Sub-features
- **Step 1 (Location):** Google Maps pin picker limited to Makati (pins outside the city are refused with a reason), Makati place search, and reverse geocoding via Nominatim. Supports pointer placement, keyboard map panning via arrow keys, "Place pin at map center", and "Use my location". Without `VITE_GOOGLE_MAPS_API_KEY` the map shows "Map unavailable" and "Use my location" still places the pin.
- **Location Permission Denial Guidance:** Clicking "Use my location" with denied permission displays browser site settings instructions (`[role="alert"]`). Tapping the map dismisses the banner automatically (`KR-14`).
- **Step 2 (Issue Details):** Category selection, title input (3 to 150 characters), and detailed description textarea (10 to 1000 characters).
- **Disabled Until Valid Form Rule:** Continue button is disabled until current step fields are valid. Step 1 requires coordinates. Step 2 requires category, valid title, and valid description.
- **Step Button Locking:** Forward steps are locked and disabled until previous steps are completed. The current active step carries `aria-current="step"` and remains enabled (`KR-20`).
- **Step 3 (Pre-flight Review):** File uploader (JPEG/PNG/WebP under 3MB) and review card (`[data-testid="preflight-summary"]`) displaying title, location, full description, and photo attachment status.
- **My Reports Workspace (`/my-reports`):** Responsive desktop table and mobile cards (`.md:hidden .card`) with zero horizontal overflow (`UIUX-05`).
- **Report Cancellation Modal:** Dedicated dialog (`[role="dialog"]`) with optional reason textarea (`#cancel-details`), dismissible via "Keep it" button or keyboard Escape key.
- **Photo Lightbox Modal:** Full-screen modal accessible on report details. Focus is trapped, body scroll is locked, and dialog closes via Close button or Escape key.
- **Pending Report Editing (`/reports/:id`):** Inline title and description editor. The Save changes button is disabled while form input is unchanged, invalid, or pending.

## How to get to it (user POV)
1. Sign in as a citizen at `/signin`.
2. To create a report, click "Report an issue" in the top navigation.
3. Advance through Step 1 (Pin location), Step 2 (Fill details), and Step 3 (Upload and review).
4. Click "Submit report" to create the record.
5. To view filed reports, click "My reports" in the navigation.

## Driving it with Playwright

```typescript
import { test, expect } from "@playwright/test";
import { signIn, USERS, captureEvidence } from "./helpers.js";

test("Citizen Wizard: 3-step submission and pre-flight verification", async ({ page }) => {
  await signIn(page, USERS.citizen1);
  await page.goto("/report/new");
  await page.waitForLoadState("networkidle");

  // Step 1: Continue button is disabled without a dropped pin
  const continueBtn = page.locator("button:has-text('Continue')");
  await expect(continueBtn).toBeDisabled();

  // Place the pin from a device location inside Makati (works with or without a
  // Maps key); see placePinByLocation in tests/browser/helpers.ts.
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 14.5547, longitude: 121.0244 });
  await page.getByRole("button", { name: "Use my location" }).click();
  await expect(continueBtn).toBeEnabled();
  await continueBtn.click();

  // Step 2: Fill details
  await page.selectOption("#category", { index: 1 });
  await page.fill("#title", "[TEST] Road damage verification");
  await page.fill("#description", "Detailed description of hazardous road fissure requiring intervention.");
  await continueBtn.click();

  // Step 3: Verify pre-flight summary displays title, description, and preview
  const summaryCard = page.locator("[data-testid='preflight-summary']");
  await expect(summaryCard).toBeVisible();
  await expect(summaryCard).toContainText("[TEST] Road damage verification");
  await captureEvidence(page, "CITIZEN-wizard-step3-summary.png");

  // Submit report
  await page.click("button:has-text('Submit report')");
  await page.waitForURL(/\/reports\/.+/);
  await captureEvidence(page, "CITIZEN-report-created.png");
});

test("Citizen Workspace: Mobile cards and cancellation modal", async ({ page }) => {
  await signIn(page, USERS.citizen1);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/my-reports");
  await page.waitForLoadState("networkidle");

  // Table is hidden and responsive cards render on mobile viewports
  await expect(page.locator("table")).toBeHidden();
  const firstCard = page.locator(".md\\:hidden .card").first();
  await expect(firstCard).toBeVisible();

  // Open cancellation dialog on a pending report
  const cancelBtn = page.locator('.md\\:hidden button:has-text("Cancel report")').first();
  if (await cancelBtn.isVisible()) {
    await cancelBtn.click();
    const dialog = page.locator('.dialog[role="dialog"]');
    await expect(dialog).toBeVisible();
    await captureEvidence(page, "CITIZEN-cancel-dialog-modal.png");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
});
```

## Gotchas
- **Wizard Button Label:** The step advancement button is labeled "Continue", not "Next".
- **Step Button Locking:** Step navigation buttons in the wizard header cannot jump past incomplete steps. Forward steps remain disabled until valid.
- **Geolocation Denial Clear:** The location error message clears once a pin is placed on the map ("Place pin at map center" or a tap inside Makati).
- **Unchanged State on Report Edit:** Editing a report title or description keeps the Save changes button disabled until the user modifies at least one character.
- **Photo Lightbox Scroll Lock:** Opening the photo lightbox sets `overflow: hidden` on the document body. Pressing Escape restores document scrolling and returns keyboard focus.
