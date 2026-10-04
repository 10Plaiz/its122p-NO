# Feature Map: Admin Management and Navigation

Route: `/admin/*` (`/admin`, `/admin/reports`, `/admin/users`, `/admin/categories`, `/admin/logs`)
Persona: Administrator (`fixture-admin@kamoti.invalid`)

## Sub-features
- **Executive Metrics Dashboard (`/admin`):** Total reports, resolved counts, average turnaround time, and status and category breakdown cards.
- **Persistent Secondary Sub-Tabs:** Consolidated top header containing a single "Admin" link paired with persistent secondary sub-tabs across all admin modules (`Dashboard`, `Reports`, `Users`, `Categories`, `Activity`).
- **Report Triage and Staff Assignment (`/admin/reports`):** The initial status is Pending. Status, barangay, and category options count every matching page while respecting other filters. Clear filters shows every status. The assignment dialog (`#staff`) disables Assign until a staff member is selected (`KR-10`), contains keyboard focus, closes with Escape, and restores focus on dismissal. Retired categories remain selectable for historical audit, labeled with `(retired)` (`KR-11`).
- **User Provisioning and Role Controls (`/admin/users`):** Account creation, password setup, role modifications, and activation confirmation. Search is the last toolbar control. Search, status, role, residency, and filter counts use the loaded complete users response. Proof waiting for review excludes accounts without an uploaded proof. Staff and Administrator selections clear and disable residency; their counts reflect that reset. Rows stack below 768 px.
- **Account Activation Confirmation:** Deactivate and Reactivate open a native dialog. Initial focus goes to Cancel. Tab wraps within its controls; Escape and cancellation return focus to the trigger. In-flight saves disable controls and dismissal. Failed saves retain the dialog and current account status.
- **Loading and Empty States:** A failed users load offers Try again without claiming an empty result. Empty filtered lists offer Clear filters. New account supports Enter submission, keeps input after failure, and prevents dismissal or duplicate submission while sending.
- **Admin Self-Action Invariant:** An administrator cannot change their own role or deactivate their own account. The row displays "This is your own account." with an explanation and disables both actions (`KR-06`).
- **Role Change Cancellation:** Cancelling a role modification discards the selection immediately. Reopening the dropdown reflects the saved role, and Save is disabled while unchanged (`KR-05`). Role values render as capitalized labels (`KR-09`).
- **Category Maintenance (`/admin/categories`):** Add new categories and retire inactive ones. Category name requires at least 2 characters (`KR-07`). Retiring a category asks for confirmation and can be cancelled with "Keep it" (`KR-12`).
- **Audit Logs (`/admin/logs`):** Immutable chronological record of system mutations with actor details. Action and role counts include every page and respect report reference and date restrictions. Failed or incomplete counting offers Retry counts while keeping the list usable.

## How to get to it (user POV)
1. Sign in as admin at `/signin`.
2. The user is redirected to `/admin`.
3. Switch between Analytics, Reports, Users, Categories, and Activity via secondary sub-navigation tabs.

## Driving it with Playwright

```typescript
import { test, expect } from "@playwright/test";
import { signIn, USERS, captureEvidence } from "./helpers.js";

test("Admin Suite: Dashboard and navigation validation", async ({ page }) => {
  await signIn(page, USERS.admin);
  await page.goto("/admin");
  await page.waitForLoadState("networkidle");

  await expect(page.locator("h2, h1")).toContainText("Dashboard");
  await captureEvidence(page, "ADMIN-dashboard.png");

  // Verify secondary sub-tabs
  const subNav = page.locator("nav[aria-label='Admin navigation tabs']");
  await expect(subNav).toBeVisible();
  await subNav.locator("a:has-text('Reports')").click();
  await page.waitForURL(/\/admin\/reports/);
  await captureEvidence(page, "ADMIN-reports-triage.png");
});

test("Admin Controls: Self-protection and role cancellation", async ({ page }) => {
  await signIn(page, USERS.admin);
  await page.goto("/admin/users");
  await page.waitForLoadState("networkidle");

  // Verify self-protection on own account row
  const ownRow = page.locator("tr", { hasText: USERS.admin });
  await expect(ownRow.locator("button:has-text('Change role')")).toBeDisabled();
  await expect(ownRow).toContainText("This is your own account.");

  // Verify role tag formatting on citizen row
  const citizenRow = page.locator("tr", { hasText: USERS.citizen1 });
  await expect(citizenRow.locator(".tag")).toHaveText("Citizen");
});
```

## Gotchas
- **Global Header Consolidation:** The primary navigation uses a single "Admin" link rather than nine individual links. Secondary navigation tabs handle section switching.
- **Self-Modification Guard:** Automated tests attempting to change roles on the logged-in administrator will fail because the button is intentionally disabled.
- **Unsaved Dropdown State:** The role dropdown resets to the database value when cancelled. It does not carry unsaved selections across modal opens.
- **Category Retirement Confirmation:** Clicking "Retire" does not immediately deactivate a category. It reveals a confirmation prompt with "Yes, retire" and "Keep it" options.
