# Awaiting verification filter, 16 October 2026

Issue: [#82](https://github.com/10Plaiz/its122p-NO/issues/82)

## Target

| Item | Value |
| :--- | :--- |
| Revision | `fix/82-awaiting-verification-filter` from `main` at `9860829` |
| Database | Local Supabase CLI stack `kamoti` (`kamoti.test_database = 'disposable'`) |
| Shared project | Not contacted |

## Results

| Check | Result |
| :--- | :--- |
| `staff.browser.ts` FUNC-02 on `main` | Fails: `#status option[value="awaiting_verification"]` not found |
| `staff.browser.ts` FUNC-02 on this branch | Pass: My queue and Admin Reports list the request under Awaiting verification, with a count |
| `filters.browser.ts`, all 7 | Pass, including "Admin Reports starts Pending" and the Staff queue counts |
| `GET /api/reports?status=awaiting_verification` and the export, as Administrator, Staff and Citizen | 200. They return the same rows, all with an undecided request, each within that role's scope |
| `GET /api/reports?status=awaiting` | 400 |
| Admin Reports at 375, 768 and 1280 px; My queue at 375 and 1280 px | The label fits the Status field. No horizontal overflow, no console errors |

## Evidence

| File | Shows |
| :--- | :--- |
| [82-01-admin-reports-1280.png](82-01-admin-reports-1280.png) | Admin Reports filtered to Awaiting verification |
| [82-02-admin-reports-375.png](82-02-admin-reports-375.png) | The same at 375 px |
| [82-03-staff-queue-1280.png](82-03-staff-queue-1280.png) | My queue filtered to Awaiting verification |
