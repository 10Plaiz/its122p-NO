# KAMOTI design-system audit

Audited on 2026-10-04 at `http://localhost:5174`, on branch
`feat/integration-ui-ux` with base `11a2cf6`. The API used port 4001.
Hallmark supplied the design audit; the project verification skill supplied
the browser-driving and evidence workflow.

## Verdict

A global design system exists. Archivo typography, square corners, a 4 px
spacing scale, shared controls, and visible rules give the app a consistent
foundation. Its color semantics and CSS ownership were inconsistent.
The approved refinement keeps that foundation and reserves red for errors and
destructive actions.

The live system is now documented in [design.md](../../../design.md), with one
canonical [token register](../../../src/web/styles/tokens.css).

Voice inferred from the existing civic reporting copy: calm, direct, practical,
and accountable. Routine reporting should feel manageable. Delays and failed
actions should be recognizable without coloring every issue as an emergency.
The viewing context includes narrow mobile screens and outdoor use.

## Critical findings

| Tell | Where | Evidence | Correction | State |
| :--- | :--- | :--- | :--- | :--- |
| Semantic color collision | `styles/app.css:19`, `components/ui.tsx`, `components/Layout.tsx`, `pages/Notifications.tsx` | The same red identified primary actions, open work, unread items, and errors. | Separate action, information, success, warning, and danger roles. | Addressed |
| Insufficient text contrast | `styles/ds.css:45`, `styles/ds.css:71`, `styles/ds.css:153` in the baseline | Red button labels measured 3.760:1, muted body text 3.652:1, and outlined red labels on cards 3.467:1. | Use readable opaque text tokens and a darker action fill; remove dialog text opacity. | Addressed |
| Horizontal page overflow | `components/data-table/DataTable.tsx`, `pages/AdminUsers.tsx` | At 320 px the reports page was 859 px wide and users page 797 px wide. Making the scroll wrappers relative reduced both to 320 px in a live experiment. | Keep absolutely positioned accessible labels inside their table scroll container. | Addressed |
| The side-stripe card | `pages/Notifications.tsx:194` in the baseline | Unread notification cards carried a 4 px red left stripe. | Use an information-colored perimeter and a written New badge. | Addressed |
| Card-in-card | `pages/StaffReport.tsx`, action workbench and its individual forms | A bordered workbench contains several bordered form sections, increasing visual containment. | In a later layout pass, remove one containment layer and use headings and dividers to separate actions. | Follow-up |

The color collision and contrast findings extend Hallmark's taste audit with
the user's explicit red reservation and accessibility criteria.

## Major findings

| Tell | Where | Evidence | Correction | State |
| :--- | :--- | :--- | :--- | :--- |
| Component rules override page hierarchy | `styles/app.css:6` in the baseline, `components/BoardReportCard.tsx:42` | A badge requested at 12 px rendered at 11 px because unlayered component rules outranked Tailwind utilities. Similar overrides affected headings, padding, and alignment. | Put the shared styles in the components cascade layer. | Addressed |
| Design-system ownership drift | `styles/ds.css:1`, wireframe readme, `docs/UI_UX_ANALYSIS.md` | The stylesheet claimed the wireframes remained the upstream authority, while the application had already introduced different status and photo behavior. There was no root design contract. | Define the current application contract and retain wireframes as historical references. | Addressed |

## Minor findings

| Tell | Where | Evidence | Correction | State |
| :--- | :--- | :--- | :--- | :--- |
| Dense metadata | `components/ui.tsx`, `pages/StaffReport.tsx`, `components/Layout.tsx` | Many identifiers and secondary labels use 9.5 to 11 px text. Contrast is corrected, but size remains a readability concern on mobile. | Evaluate a larger metadata scale during a typography and density pass. | Follow-up |
| Renderer token copies | `lib/export.ts:87`, `components/MapFrame.tsx:79` | PDF exports retain RGB copies of the former neutral palette. The map renderer has a fallback hex value that must track the corresponding token. | Consider a shared renderer adapter when changing export or map presentation. | Follow-up |

## Palette applied

| Role | Color | Examples |
| :--- | :--- | :--- |
| Action | `#0D6374` | Report an issue, Save, selection, focus, in-progress work |
| Information | `#1F5B8F` | Under review, unread notifications |
| Success | `#155F35` | Resolved, verified, successful password change |
| Warning | `#6B4500` | Delayed, awaiting verification, incomplete residency setup |
| Danger | `#B42318` | Invalid fields, failed requests, cancellation, retirement, deactivation, rejection, permanent removal |
| Neutral | Cool tinted neutral ramp | Categories, roles, pending, cancelled, rejected decisions |

Measured token pairs: primary button text 6.383:1, muted text on the page
5.993:1, muted text on cards 5.552:1, danger text on its tint 5.745:1.
These are calculations for the named pairs, not a claim that the whole app
meets every accessibility criterion. The text criterion is defined in
[WCAG contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

## Verification and evidence

- Frontend and test TypeScript checks passed.
- The frontend production build passed.
- Three focused browser regression tests passed, covering primary and helper
  text contrast, red validation feedback, placeholder contrast, dialog text,
  mobile table containment, and red destructive confirmation styling.
- The contrast helper includes parent opacity. Temporarily restoring the old
  dialog opacity reduced the measured ratio from 5.552:1 to 4.052:1, proving
  that the regression check detects the original failure.
- The browser sweep used 320, 375, 414, 768, and 1280 px widths. The recorded
  rendered text samples and page widths passed after the dialog correction.
- Navigation, board expansion and filtering, invalid-field feedback, assignment
  opening and dismissal, and category-retirement opening and cancellation were
  exercised. Destructive actions were not confirmed.

Run the focused checks against the existing local servers with:

```powershell
bunx playwright test --config tests/evidence/hallmark-design-system-2026-10-04/playwright.config.mjs
```

The local configuration uses the documented presentation admin and installed
Chrome. It runs without database cleanup because these checks create no records.

[observations.json](observations.json) records requested view names, actual URLs,
headings, computed styles, screenshots, and console issues. Names describe the
requested view; use the actual URL and headings to assess coverage.

Representative screenshots:

- [Entry page](entry-1280.png)
- [Public board](board-1280.png)
- [Staff report](staff-report-375.png)
- [Admin dashboard](admin-dashboard-1280.png)
- [Admin reports on mobile](admin-reports-375.png)
- [Assignment dialog on mobile](assign-dialog-375.png)
- [Destructive confirmation](retire-confirmation-1280.png)

Baseline evidence is in the sibling `hallmark-audit-2026-10-04-live`,
`hallmark-audit-2026-10-04-authenticated`, and `hallmark-audit-2026-10-04-personas`
folders. The first sandboxed audit folder also records its network limitations
and an outdated registration selector used by the driver.

## Verification limits

- Citizen 2 signs in but redirects protected citizen routes to
  `/register?step=proof`. The residency gate was verified. My reports, account,
  and the report wizard received source review; their requested URLs did not
  establish runtime coverage. The Users screen had no eligible verified demo
  citizen available for the attempted wizard follow-up. No residency or account
  records were changed to bypass the gate.
- `/signin?step=confirm` renders ordinary sign-in. The actual email-confirmation
  state was source-reviewed; it was not exercised by that query string.
- Google Maps reports `RefererNotAllowedMapError` for the localhost origin.
  Actual map rendering and pin appearance could not be verified. Status color
  mapping was checked in frontend source and the public legend.
  The later [map-failure verification](../board-map-failure-2026-10-04/report.md)
  records the frontend correction that keeps the board usable after a rejected
  key, blocked script, or SDK rendering failure.
- A missing browser icon generated a 404. A rating-summary request failed during
  the baseline admin run and succeeded in the later sweep. These observations
  are recorded without backend or environment changes.
- The sweep is a focused visual check, not a full accessibility or full
  product-workflow certification. Remaining hierarchy and metadata findings
  are listed above.

All implementation changes are in the frontend, its browser regression tests,
and design documentation. Server code, API contracts, database migrations,
runtime configuration, and account state were not changed.

5 critical · 2 major · 2 minor
