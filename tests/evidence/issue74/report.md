# Real-address accounts and the student-project notice, 16 October 2026

Issue: [#74](https://github.com/10Plaiz/its122p-NO/issues/74)

## Decision (project lead, 2026-10-16)

| Accounts on the test project | Count | Decision |
| :--- | ---: | :--- |
| Staff and Administrators | 7 | Team accounts, kept and shared for testing |
| Citizens awaiting review, no proof | 11 | Kept until the project is retired |
| Citizens awaiting review, proof uploaded | 5 | An Administrator reviews them with the four checks (#63) |
| Citizens, inactive | 1 | Left inactive |

The project stays up as a portfolio, and current proofs are kept until it is
retired (accepted in `SECURITY.md`). Sign-up stays open. The consent wording is
unchanged. The site now says it is a student project: in the footer of every
page, above the consent on the sign-up form, and above the file picker on the
proof step, which asks for a sample document instead of a real one.

## Target

| Item | Value |
| :--- | :--- |
| Revision | `docs/74-test-site-notice` from `main` at `dae6e24` |
| Database | Local Supabase CLI stack `kamoti` with Mailpit |
| Shared project | Not contacted. No account or document was opened |

## Results

| Check | Result |
| :--- | :--- |
| `public.browser.ts` "#74: every page's footer and the sign-up form say KAMOTI is a student project" | Pass: footer text on the board; notice above `#consent` on `/register` |
| `accounts.browser.ts` UA-5 | Pass: `#sample-proof-notice` on the proof step of a new account |
| `responsive.browser.ts` | 6/6 |
| Width at 320, 375, 768, 1280 px on `/register` and `/board` | No horizontal overflow |
| Contrast, notice and footer text against the page | 5.99:1 at every width (4.5:1 needed) |
| Console errors on those pages | None |

## Evidence

| File | Shows |
| :--- | :--- |
| [74-01-register-320.png](74-01-register-320.png) | Sign-up form at 320 px: the notice sits directly above the consent |
| [74-02-proof-step.png](74-02-proof-step.png) | Proof step at 1280 px: the sample-document notice directly above the file picker, and the footer |
| [74-03-footer-320.png](74-03-footer-320.png) | Footer at 320 px, wrapping inside the page |
