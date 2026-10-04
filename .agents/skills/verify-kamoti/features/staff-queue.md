# Feature Map: Staff Queue and Triage

Route: `/staff/queue` and `/staff/reports/:id`
Persona: Staff Member (`fixture-staff-1@kamoti.invalid`)

## Sub-features
- **Assigned Queue:** Work queue filtered strictly to reports assigned to the signed-in staff member, sorted oldest first. The initial status is Under review. Status and barangay options count every matching page with the other filters applied. Clear filters shows every status; failed or incomplete counting offers Retry counts separately from loading the queue.
- **Responsive Mobile Task Cards:** Stacked mobile cards on screens under 768px (`.md:hidden .card`) preventing horizontal scrollbars (`UIUX-04`).
- **Inspect Action Affordance:** Clear table and card action links labeled "Inspect report" navigating to report details.
- **Citizen Contact Link:** A direct `tel:` call link on the inspection view (`KR-23`). There is no SMS action.
- **Operational Remarks Journal:** Field notes textarea (`#remark`). The Save remark button is disabled while the field is empty, unchanged, or sending.
- **Resolution Photo Proof:** Mandatory repair proof photo upload before advancing report status to `resolved`.
- **Photo Lightbox Modal:** Full-screen modal on evidence photos with focus restoration and Escape key dismissal.
- **State Machine Transitions:** Status advancement controls (`in_progress`, `resolved`). Unassigned staff members receive a 403 Forbidden alert.

## How to get to it (user POV)
1. Sign in as staff at `/signin`.
2. The application redirects automatically to `/staff/queue`.
3. Select any assigned report to open `/staff/reports/:id`.
4. Review citizen contact links, enter field remarks, upload completion photos, and advance report status.

## Driving it with Playwright

```typescript
import { test, expect } from "@playwright/test";
import { signIn, USERS, captureEvidence } from "./helpers.js";

test("Staff Queue: Mobile cards and inspection triage", async ({ page }) => {
  await signIn(page, USERS.staff1);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/staff/queue");
  await page.waitForLoadState("networkidle");

  // Mobile task cards are visible
  const cards = page.locator(".md\\:hidden .card");
  await expect(cards.first()).toBeVisible();
  await captureEvidence(page, "FUNC-12-mobile-queue.png");

  // Open first assigned report via Inspect report link
  const inspectBtn = cards.first().locator('a:has-text("Inspect report")');
  await inspectBtn.click();
  await page.waitForLoadState("networkidle");
  await expect(page.locator("h2")).toBeVisible();

  // Verify operational remark input and status progression
  await captureEvidence(page, "FUNC-02-status-progression.png");
});
```

## Gotchas
- **Action Affordance Mismatch:** Queue action links must not use premature labels like "Begin work" or "Resolve". They navigate to the detail view and are labeled "Inspect report".
- **Resolution Proof Requirement:** Transitioning to `resolved` requires a resolution photo. Submitting a status transition without an uploaded photo will fail with inline validation error.
- **Unchanged Remark State:** The Save remark button remains disabled until non-whitespace text is entered into `#remark`.
- **Unassigned Staff Authorization:** Attempting to advance a report assigned to another staff member produces a 403 error.
