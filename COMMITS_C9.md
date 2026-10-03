# Commit instructions: Phase 2 C9 (citizen self-edit, polish, hardening)

Written 2026-10-04 on `improve/integration` at `e93a8a8`, which GitHub has. Follow the steps in order. Nothing has been committed or pushed for you. `COMMITS.md`, `COMMITS_C6.md`, `COMMITS_C7.md`, and `COMMITS_C7b_C8.md` stay as they are.

## Order
1. `COMMITS_C7.md`: three commits.
2. `COMMITS_C7b_C8.md`: four commits.
3. This file: three commits.

Two things move with the earlier lists, and both are harmless:
- **`tests/integration/security.ts`** is staged by step 5 of `COMMITS_C7b_C8.md`. It now also holds IMP-10 and IMP-11, which test C9's sign-out and account edit. Until this file's commits are in, those two cases would fail if someone ran `bun run test:security`. `bun test`, typecheck, and build are unaffected, because the security suite is a separate script.
- **The scope docs and notes** (`docs/Final_Project.md`, `docs/updates/IMPROVEMENT_REQUIREMENTS.md`, `ISSUES.md`, `PHASE2_PLAN.md`, `HANDOFF.md`) are staged by step 5 of `COMMITS_C7.md`. They now also record C9. That is documentation only.

## What C9 does
| Item | What changes |
| :--- | :--- |
| UA-13 / KI-10 citizen self-edit | New **My account** page (`/account`, in the citizen menu): view details, then **Edit details** for name parts, mobile number, barangay, and street, under the registration rules. Email is not editable here. Server: `PATCH /api/auth/me`, citizens only. |
| UA-13 rules (your decisions) | A new number loses its verified mark; the activity log keeps the old and new number. A new barangay or street sends residency back to "not yet reviewed" and the account stays usable; a proof for the new address can be sent on the same page. An account an admin verified **without any uploaded proof** is warned before saving, then asked for a proof before it opens again. |
| KI-13 sign-out | The browser sends the refresh token with sign-out, so the server ends the session even after the access token expired. |
| KI-16 reset code | If Supabase refuses the new password after the code was checked, the message says the code is used up and to ask for a new one. |
| KI-18 home page | For a citizen locked by UA-8, "Report an issue" is greyed with "Send your proof of residency first" and a link to the upload step. |
| KI-20 PDF | `pdfText()` turns arrows into ASCII, drops emoji, and prints "?" for other characters the built-in font cannot draw. CSV keeps the original text. |
| KI-21 bundle | Admin and staff pages load on first visit. The main chunk drops from about 513 kB to about 440 kB, and the build warning is gone. |

## Checks
The whole pending sequence (C7, C7b/C8, then C9) was replayed in a throwaway worktree, and the replayed files matched this working tree.

| After | typecheck | bun test | build |
| :--- | :--- | :--- | :--- |
| All C7 and C7b/C8 commits | pass | 506 pass / 0 fail | pass, but warns: main chunk about 513 kB |
| Commit 1 (server) | pass | 506 pass / 0 fail | pass, warns as above |
| Commit 2 (web) | pass | 517 pass / 0 fail | pass, no warning (about 440 kB) |

### On local Supabase only, never the shared project
- **Security suite:** 39 of 39.
  - IMP-10: signing out with a garbage access token plus the refresh token returns 204, and the old refresh token then gets 401. Before C9 this case would fail, because logout required a valid access token.
  - IMP-11: staff are refused (403); a barangay outside Makati gets 400; a real edit clears the verified mark, puts residency back to pending, and logs the old and new number.
  - Fixture citizen 1 was restored exactly afterwards.
- **Browser spot check:** 13 of 15. The two failures were faults in my check script, and both were re-checked:
  - The proof section was there (a proof was sent through it in the next step). My check wrongly required no "Sign out" button, but the header always has one.
  - The greyed home button was confirmed in a clean session (`aria-disabled="true"`).

  The spot check covered:
  - the My account link
  - viewing and editing details
  - the review warning, saving, and sending a proof from My account
  - the no-proof warning, then the redirect to the upload step
  - every admin page and the staff queue loading on demand
  - no console errors
- **Not run:** the full browser suite after C9 (stopped). Run it before merging; see `TEAM_HANDOFF.md`.

## Step 1. Check where you are
```bash
git branch --show-current          # expect: improve/integration
git log --oneline -8               # expect the C7 and C7b/C8 commits on top of e93a8a8
git status --short                 # expect only the 14 files in steps 3 to 5
```

## Step 2. Run the checks yourself (optional but recommended)
```bash
bun run typecheck
bun test                           # expect 517 passing after step 4
bun run build                      # expect no 500 kB warning after step 4
```

## Step 3. Commit the server side
Use exact paths. Never `git add -A` or `git add .`, because `.claude/worktrees/` would be staged.
```bash
git add src/server/routes/auth.routes.ts src/server/lib/accounts-email.ts
git commit
```
Message:
```
feat(api): citizens edit their own details; sign-out ends expired sessions

PATCH /api/auth/me (citizens) saves name parts, mobile number,
barangay, and street under the registration rules. A new number clears
phone_verified_at and the log keeps the old and new number; a new
address sends residency back to review (an account verified without a
proof file is then asked for one). POST /api/auth/logout takes the
refresh token, so a session whose access token expired is still ended
(KI-13). A refused new password after a spent reset code now says to
ask for a new code (KI-16).
```

## Step 4. Commit the web side
```bash
git add src/web/pages/Account.tsx src/web/components/ResidencyProofStep.tsx \
  src/web/components/Layout.tsx src/web/components/AdminLayout.tsx \
  src/web/lib/api.ts src/web/lib/auth.tsx src/web/pages/Entry.tsx src/web/lib/export.ts \
  src/web/routes.tsx tests/fast/account-edit.test.ts
git commit
```
Message:
```
feat(web): My account page, lazy staff and admin pages, PDF text fix

My account shows a citizen's details and edits them, warns before an
address change goes back to review, and takes a proof for the new
address. Sign-out sends the refresh token. The home page greys "Report
an issue" for a locked citizen (KI-18). Staff and admin pages load on
first visit, taking the main chunk under 500 kB (KI-21). PDF exports
replace characters the built-in font cannot draw (KI-20).
```

## Step 5. Commit the handoff files
```bash
git add COMMITS_C9.md TEAM_HANDOFF.md
git commit -m "docs: C9 commit instructions and the team handoff"
```

## Step 6. Push and confirm
```bash
git push origin improve/integration
git status --short                 # expect: nothing
```
It is a fast-forward, so no force is needed.

## Optional trailer
If you want it, end each message with this line, after a blank line:
```
Claude-Session: https://claude.ai/code/session_01F2YXueyCAknu3LPazw69pd
```
