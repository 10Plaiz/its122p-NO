# PR notes: issue #38, second batch (KR-03, KR-07, KR-08, KR-20)

Scratch file for the next pull request. Section 1 lists what to commit. Section 2 is
the PR body, ready to paste into [the template](.github/pull_request_template.md).
Delete this file once the PR is open. Part one's batch merged as #41.

| Field | Value |
| :--- | :--- |
| Branch base | `9809563` on `main` |
| Suggested branch | `fix/review-findings-batch-2` |
| Scope | `KR-07`, `KR-08`, `KR-20` in code; `KR-03` in the database, plus automatic test-data cleanup so it stays fixed |
| Deliberately excluded | `KR-24` to `KR-28` (evidence and Phase 4 docs), which are someone else's in-progress work |
| Files | 9 source, 5 test (1 new), 4 config and docs |
| State | Uncommitted in the working tree; no branch cut, no PR opened |

---

# 1. What to commit

Stage **only** these files. Everything else in `git status` belongs to other work.

**Commit 1: `apply one disabled-until-valid rule and mark invalid fields`**

- `src/web/components/ui.tsx`
- `src/web/components/ContactNumberField.tsx`
- `src/web/components/PhotoPicker.tsx`
- `src/web/pages/AdminCategories.tsx`
- `src/web/pages/AdminUsers.tsx`
- `src/web/pages/NewReport.tsx`
- `src/web/pages/Register.tsx`
- `src/web/pages/ReportDetail.tsx`
- `src/web/pages/StaffReport.tsx`
- `docs/FRONTEND.md`
- `tests/browser/auth.browser.ts`

**Commit 2: `clean up browser test data after every run`**

- `tests/browser/cleanup.ts` (new)
- `tests/browser/helpers.ts`
- `tests/browser/staff.browser.ts`
- `tests/browser/citizen.browser.ts`. This goes here rather than in commit 1 because it
  imports `TEST_TITLE_PREFIX` from `helpers.ts`. It also carries the `KR-07` and `KR-20`
  wizard assertions.
- `playwright.config.ts`
- `package.json`
- `docs/LOCAL_DEV.md`

**Leave out:**

| Path | Why |
| :--- | :--- |
| `docs/INDEX.md`, `docs/Phase4_Test_Report.md`, `docs/Phase4_Member_Sections.md`, `PHASE4_SUBMISSION.md` | `KR-24` to `KR-28` work in progress |
| `tests/browser/responsive.browser.ts` and the renamed `FUNC-12-desktop-*.png` | `KR-27` rename |
| Every other modified file in `tests/evidence/` | Overwritten by local test runs against `localhost` (`KR-24`); regenerate them deliberately with the evidence work |
| `CODE_REVIEW_FINDINGS.md`, `PR_NOTES_PART2.md`, `.agents/`, `.claude/skills/` | Local notes and tooling |

---

# 2. PR body

## Linked issue

Addresses #38: `KR-03`, `KR-07`, `KR-08`, `KR-20`. Does not close it, because `KR-24`
to `KR-28` remain open.

## What changed

**One form rule, applied everywhere (`KR-07`)**

The team's decision was **disabled until valid**. Batch 1 (#41) applied it to four
forms. This PR applies it to the five that were left, so no form uses the old
click-then-error pattern:

| Form | Button |
| :--- | :--- |
| Register | Create account |
| Admin → New account | Create account |
| Report wizard | Continue, Submit report |
| Citizen report edit | Save changes |
| Staff report | Save remark |

- The rule lives in one helper, `useLeftFields()` in `src/web/components/ui.tsx`.
  - An action button is disabled while its form is invalid or sending.
  - A field shows its error once the person leaves it. That's what explains the
    disabled button, and an untouched form doesn't open covered in errors.
  - It replaces the per-form `touched` state that each page kept.
- Fields whose requirement wasn't stated now have a hint, such as
  "At least 3 characters."
- The citizen's report edit also disables **Save** while nothing has changed. This
  matches the admin row editors from #41. Before, it silently closed the editor.
- **Wizard:** a step button can't jump past an unfinished step. Before, the step
  buttons let a citizen skip an invalid step, and the error only appeared on Submit.
- **Sign-in stays the one exception**, as decided in #41. Only the server can check a
  password, and browser autofill can leave a disabled button stuck.
- The rule is written down in `docs/FRONTEND.md`, which `KR-07` asks for.

**Invalid fields are announced, not only coloured (`KR-08`)**

- `Field` gives its hint or error text a stable id through `fieldNoteId()`, and sets
  `aria-invalid` and `aria-describedby` on its control. Every control rendered in a
  `Field` gets this with no change to the page.
- The two components that wrap their own control set the same attributes directly:
  `ContactNumberField` and `PhotoPicker`.
- The category row editor sits outside `Field`, so its name input now carries
  `aria-invalid` and points at its "At least 2 characters." note.
- Row-level save errors in Admin → Users and Admin → Categories now use
  `role="alert"`, so they're read out.

**Current wizard step is announced (`KR-20`)**

- The current step button has `aria-current="step"` and is no longer `disabled`, so it
  stays focusable.
- Locked steps say "(not available yet)" to screen readers.

**Test data no longer piles up (`KR-03`)**

Browser tests run against the same Supabase project the live site uses. Every
`bun run test:browser` left a `[TEST] …` report and a staff remark behind, which is how
23 of them reached the admin and staff screens.

- New `tests/browser/cleanup.ts` runs as Playwright's `globalTeardown` after every run,
  pass or fail. It also runs on its own with `bun run test:cleanup`.
- It runs only when verified: the `.env` secret key works, and all five fixture
  accounts exist in that project. Otherwise it prints why and deletes nothing. It never
  fails the test run.
- It deletes only rows that match **both** conditions:
  - owned or written by a fixture account, and
  - carrying a test marker: a title starting with `[TEST]`, or the exact staff remark.

  `[FIXTURE]` reports, real reports and demo-seed data can't match.
- The title prefix and remark text are shared constants in `tests/browser/helpers.ts`,
  so the tests and the cleanup can't drift apart.

No API or database contract changed.

## Completion criteria and evidence

| Criterion | Result and how it was validated |
| :--- | :--- |
| `KR-03` No report or category on the deployed site contains `ZZ` or `TEST` | **Pass for all test-marker data** (one deliberate exception, below). <br>Category 7 and the `ZZ TEST` report title were fixed in the Supabase SQL editor. `Wala naman talagang baha` (KMT-2026-000005, with its photo) and `ZZ TEST second report for cancelling` (KMT-2026-000002) were deleted. `bun run test:cleanup` removed the 23 `[TEST]` reports and 12 test remarks. <br>A re-query finds no `ZZ`, `[TEST]` or `Wala` title, and the public total is unchanged at 112. <br>**Exception:** the kept fixture report `[FIXTURE] Overflowing drainage canal on Test Street` still contains the word "Test"; see follow-ups. |
| `KR-03` `/board` renders only presentable titles | **Pass.** A scan of every public report page finds no test-marker title. |
| `KR-07` One documented rule, applied to every action button | **Pass.** Rule in `docs/FRONTEND.md` and on `useLeftFields`. <br>An audit of every `disabled={` clause in `src/web` finds each form action on `pending \|\| invalid` (plus `unchanged` on edit forms). The others have nothing to validate: pagination, notifications, the optional cancel reason, status advance and retire confirm. Sign-in is the documented exception. |
| `KR-07` No form is left on the old pattern | **Pass.** No `touched` state remains outside sign-in. <br>New browser test `KR-07, KR-08`: Register is disabled when empty and enabled once valid. `FUNC-01b` now asserts Continue is disabled with no pin, and later steps are locked. `UIUX-02` asserts that clearing the title disables Continue and locks Step 3. |
| `KR-08` A control inside a `Field` with an error carries `aria-invalid="true"` and a resolving `aria-describedby` | **Pass.** `AUTH-09` asserts both on the sign-in email field, and that the described element contains the error. The new Register test asserts the same after leaving a field, and that an untouched field isn't marked. |
| `KR-08` No unlabelled invalid control | **Pass by audit.** Every `Field` usage passes its control as the direct child with a matching `id`, apart from the two wrapper components that set the attributes themselves. The one control outside `Field` with a validity state (category row name) is wired by hand. |
| `KR-20` Current step uses `aria-current="step"` and is not disabled | **Pass.** `UIUX-02` asserts the `aria-current="step"` element reads "Step 2" and is enabled. |
| Test data is removed after every run, only when verified | **Pass.** <br>Ran `FUNC-01a` and `FUNC-07`, the two tests that write data: the teardown printed `1 report(s), 1 remark(s) removed.` and a rerun found nothing left. <br>With no key, and with a wrong key, it printed the reason and deleted nothing. <br>A second `test:cleanup` removed nothing, so it's safe to rerun. |

## Database and Supabase changes

- [x] This PR does not change migrations, RLS, storage, or Supabase setup.
- [ ] This PR changes migrations or Supabase access; the migration files and
      expected dry-run result are described above or in the linked issue.
- [x] No Supabase key, database password, or CLI token is included in this PR.

The `KR-03` cleanup was a one-time **data** change on the linked project, done
before this PR, and doesn't need repeating. The cleanup script reads the existing
`SUPABASE_URL` and `SUPABASE_SECRET_KEY` from each member's own `.env`.

## Checks

| Check | Result |
| :--- | :--- |
| `bun run typecheck` | Pass, all four projects |
| `bun run test` | Pass: **186 pass, 0 fail** |
| `bun run build` | Pass |
| Relevant feature or manual checks | Browser, against `localhost:5173`: `AUTH-09`, `KR-07, KR-08`, `FUNC-01b`, `UIUX-02`, `FUNC-01a`, `FUNC-02, FUNC-07`, **all passed**. `bun run test:cleanup` checked with a valid key, no key, a wrong key, and a rerun. |

### Limitations to record

1. **The full browser suite wasn't run for this PR.** Only the specs this change
   affects were run. The rest are unchanged and write nothing, but a full
   `bun run test:browser` before merging would confirm it.
2. **Not browser-tested:** Save remark, Admin → New account and the report edit's Save
   were checked by typecheck and by reading the code. Their tests would have written to
   the shared database before the cleanup existed.
3. **Evidence screenshots are stale for one case.** `FUNC-01b-coordinate-error.png`
   used to show an error message. The step now shows a disabled Continue, so the
   filename no longer describes the image. It belongs to the `KR-24` to `KR-27`
   evidence pass.

### Follow-ups, not in this PR

- **Stale comment from #41:** `src/web/pages/AdminCategories.tsx:174` says retiring a
  category uses "the same inline confirm the citizen's own cancel flow uses in
  MyReports". #40 replaced that with a modal, so the comment is now false, and
  destructive confirmations use two patterns again. It needs a team decision: modal
  everywhere or inline everywhere.
- **Fixture title:** rename `Test Street` in `scripts/fixture/seed.ts` if `KR-03`'s "no
  `TEST`" should hold literally. The security suite finds this report by "Overflowing
  drainage", so a rename is safe.
- **Stale default in the docs:** `docs/LOCAL_DEV.md` still says `PLAYWRIGHT_BASE_URL`
  defaults to the deployed site. `playwright.config.ts` defaults to
  `http://localhost:5173`. This is part of `KR-24`.
- After merging, tick `KR-03`, `KR-07`, `KR-08` and `KR-20` in #38.
