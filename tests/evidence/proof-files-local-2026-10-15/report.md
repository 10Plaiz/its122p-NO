# Issue #62: complete-file checks on residency proofs

Local Supabase stack (`http://127.0.0.1:54321`), `bun run dev`, Chromium through
Playwright. Synthetic Citizens and synthetic files only, deactivated afterwards.

| Step | Check | Result | Screenshot |
| :--- | :--- | :--- | :--- |
| Damaged PDF (first 60%) | Refused on the proof field; still on the proof step; no proof saved | Pass | `62-01-damaged-pdf-refused.png` |
| New file chosen | The old error clears | Pass | — |
| Valid PDF | Stored; account awaiting review | Pass | — |
| Administrator review | Opens through a signed Storage link; returns the exact file; one `residency.proof_viewed` audit | Pass | `62-02-admin-opens-valid-pdf.png` |
| Mobile 375 px, damaged PNG | Error shown without horizontal scroll | Pass | `62-03-mobile-damaged-png.png` |
| My account, unsaved edits | A damaged proof shows its error; the unsaved name and address stay in the form; proof, status, and saved address unchanged; a valid proof is then accepted | Pass | `62-04-account-edits-kept.png` |
| Console | No errors other than the expected 400 responses | Pass | — |

API: `bun run test:security -- --target 127` gave 45 passed, 0 failed. IMP-12
uploads a real PNG proof through the new checks; IMP-17 sends a damaged file
after a rejection and confirms status, note, proof, and Storage are unchanged.

Time limit (`tests/fast/proof-files.test.ts`, PRF-05): a PDF past its deadline is
refused and no further page is read; `sharp` receives the 5-second libvips
timeout; the slowest image allowed (about 40 megapixels of noise, under 5 MB)
checks well within it.
