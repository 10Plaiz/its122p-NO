# Unread notifications badge, 16 October 2026

Issue: [#83](https://github.com/10Plaiz/its122p-NO/issues/83)

## Target

| Item | Value |
| :--- | :--- |
| Revision | `fix/83-unread-badge` from `main` at `9860829` |
| Database | Local Supabase CLI stack `kamoti` (`kamoti.test_database = 'disposable'`) |
| Shared project | Not contacted |

## Causes found

1. The menu badge loaded the count once and never again.
2. `PATCH /api/notifications/read-all` answered 500 after a successful update: `orThrow` treats an update's empty `data` as a failure. The page showed "Could not mark them read" and never reloaded, though the notifications were marked.
3. The count covered only the newest 50 notifications.
4. Opening a report from a notification left it unread.

## Results

| Check | Result |
| :--- | :--- |
| `unread-notifications.test.ts` server tests on `main` | Fail: 45 unread reported of 54, no `/unread` route, read-all 500 |
| `notifications.browser.ts` on `main` | Fails: read-all answers 500 |
| The same test with only the server fixed | Fails: the badge stays at 4 after Mark read (3 expected) |
| Both on this branch | Pass: Mark read, Open report and Mark all as read each lower the badge with no reload |

## Evidence

| File | Shows |
| :--- | :--- |
| [83-01-main-mark-all-read-1280.png](83-01-main-mark-all-read-1280.png) | `main`: after Mark all as read, an error and the badge still at 6 |
| [83-02-fixed-mark-all-read-1280.png](83-02-fixed-mark-all-read-1280.png) | This branch: "You are up to date." and no badge |
