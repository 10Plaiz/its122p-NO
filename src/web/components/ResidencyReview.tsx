import { ModalDialog } from "./ModalDialog.js";
import { useEffect, useRef, useState } from "react";
import { useToast } from "./Toast.js";
import { Alert, Button, Field, StatusPill, Textarea, formatDate, useLeftFields } from "./ui.js";
import { ApiError, api } from "../lib/api.js";
import { RESIDENCY_LABEL, residencyStep } from "../lib/residency.js";
import { useAction } from "../lib/useApi.js";
import type { Profile } from "../lib/types.js";

// Mirrors residencyReviewSchema in src/server/routes/admin.routes.ts.
export const RESIDENCY_NOTE_MAX = 500;
export const RESIDENCY_NOTE_ERROR = "Say why the proof was not accepted, so the citizen knows what to upload instead.";
export const RESIDENCY_EXCEPTION_ERROR = "Say how you confirmed this resident without a document.";

// #63, owner decisions 2026-10-15: what an Administrator confirms before accepting
// an uploaded document. The ids mirror REVIEW_CHECKS in admin.routes.ts.
export const REVIEW_CHECKS = [
  { id: "name", label: (user: Profile) => `The name on the document matches ${user.name}.` },
  {
    id: "address",
    label: (user: Profile) =>
      `The address is in Makati and matches ${[user.address_line, user.barangay].filter(Boolean).join(", ") || "the account"}.`,
  },
  { id: "readable", label: () => "The document is readable and complete." },
  {
    id: "document",
    label: () =>
      "It is a utility bill from the last 3 months, a barangay certificate or clearance, a lease, or a government ID with a Makati address.",
  },
] as const;
export type ReviewCheck = (typeof REVIEW_CHECKS)[number]["id"];

export function validateResidencyNote(note: string, missing = RESIDENCY_NOTE_ERROR): string | undefined {
  const trimmed = note.trim();
  if (trimmed.length < 5) return missing;
  if (trimmed.length > RESIDENCY_NOTE_MAX) return "Keep the reason under 500 characters.";
  return undefined;
}

type ReviewBody = {
  decision: "verified" | "rejected";
  expected_version: string;
  method?: "document" | "no_document";
  checks?: ReviewCheck[];
  note?: string;
};

type Proof = {
  url: string;
  kind: "image" | "pdf";
  expires_in: number;
  residency_proof_id: string;
  residency_review_version: string;
};
type ProofView =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "opened"; proof: Proof }
  | { kind: "error"; error: ApiError };
export function ResidencyReview({
  user: initialUser,
  onClose,
  onDone,
}: {
  user: Profile;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [user, setUser] = useState(initialUser);
  const [stale, setStale] = useState(false);
  // review: checklist and the three choices; reject and exception ask for a reason.
  const [mode, setMode] = useState<"review" | "reject" | "exception">("review");
  const [checks, setChecks] = useState<ReadonlySet<ReviewCheck>>(new Set());
  const [note, setNote] = useState("");
  const fields = useLeftFields();
  const closeRef = useRef<HTMLButtonElement>(null);

  const [proofView, setProofView] = useState<ProofView>({ kind: "idle" });
  const requestVersion = useRef(0);
  const opened = proofView.kind === "opened" ? proofView.proof : null;
  const review = useAction((body: ReviewBody) => api.patch<{ user: Profile }>(`/admin/users/${user.id}/residency`, body));
  const refresh = useAction(() => api.get<{ user: Profile }>(`/admin/users/${user.id}`));
  const blocked = stale || review.pending || refresh.pending || user.role !== "citizen" || user.is_active === false;

  const step = residencyStep(user);
  const allChecked = REVIEW_CHECKS.every((check) => checks.has(check.id));
  const noteError = validateResidencyNote(note, mode === "exception" ? RESIDENCY_EXCEPTION_ERROR : RESIDENCY_NOTE_ERROR);
  const shownNoteError = fields.visible(noteError ? { "residency-note": noteError } : {})["residency-note"];

  function toggleCheck(id: ReviewCheck) {
    setChecks((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function chooseMode(next: "review" | "reject" | "exception") {
    setMode(next);
    setNote("");
    fields.reset();
    review.setError(null);
  }

  useEffect(() => () => { requestVersion.current++; }, []);

  async function openProof() {
    if (blocked || proofView.kind === "loading") return;
    const request = ++requestVersion.current;
    setProofView({ kind: "loading" });
    try {
      const result = await api.get<Proof>(`/admin/users/${user.id}/residency-proof`, {
        expected_version: user.residency_review_version,
      });
      if (request !== requestVersion.current) return;
      setProofView({ kind: "opened", proof: result });
    } catch (caught: unknown) {
      if (request !== requestVersion.current) return;
      const error = caught instanceof ApiError ? caught : new ApiError(0, "The server could not be reached.");
      if (error.status === 409) {
        requestVersion.current++;
        setStale(true);
        setProofView({ kind: "idle" });
      } else {
        setProofView({ kind: "error", error });
      }
    }
  }

  async function refreshReview() {
    if (refresh.pending || review.pending) return;
    const request = ++requestVersion.current;
    setProofView({ kind: "idle" });
    setNote("");
    setMode("review");
    setChecks(new Set());
    fields.reset();
    review.setError(null);
    const result = await refresh.run();
    if (!result || request !== requestVersion.current) return;
    setUser(result.user);
    setStale(false);
  }

  // #63: an approval names its basis; the server and the database re-check it.
  async function decide(basis: "document" | "no_document" | "rejected") {
    if (blocked) return;
    if (basis === "document" && !allChecked) return;
    if (basis !== "document" && noteError) return;
    const expected_version = user.residency_review_version;
    const body: ReviewBody =
      basis === "rejected"
        ? { decision: "rejected", expected_version, note: note.trim() }
        : basis === "document"
          ? { decision: "verified", expected_version, method: "document", checks: REVIEW_CHECKS.map((check) => check.id) }
          : { decision: "verified", expected_version, method: "no_document", note: note.trim() };
    const request = requestVersion.current;
    const result = await review.run(body);
    if (request !== requestVersion.current) return;
    if (!result) return;
    toast(basis === "rejected" ? `${user.name} was asked for a new proof.` : `${user.name} is now a verified resident.`);
    onDone();
  }

  useEffect(() => {
    if (review.error?.status !== 409) return;
    requestVersion.current++;
    setStale(true);
    setProofView({ kind: "idle" });
  }, [review.error]);

  return (
    <ModalDialog className="account-dialog" labelledBy="residency-dialog-title"
      pending={review.pending || refresh.pending} initialFocusRef={closeRef} onClose={onClose}>
        <h4 id="residency-dialog-title" className="dialog-title">
          Residency of {user.name}
        </h4>

        <div className="dialog-body flex flex-col gap-3 text-[13px]" onBlur={fields.onBlur}>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-muted">Status</dt>
            <dd className="m-0">
              <StatusPill tone={step === "verified" ? "success" : "warning"}>{RESIDENCY_LABEL[step]}</StatusPill>
            </dd>
            <dt className="text-muted">Barangay</dt>
            <dd className="m-0">{user.barangay ?? "—"}</dd>
            <dt className="text-muted">Address</dt>
            <dd className="m-0 break-words">{user.address_line ?? "—"}</dd>
            {user.residency_reviewed_at && (
              <>
                <dt className="text-muted">Last review</dt>
                <dd className="m-0">
                  {formatDate(user.residency_reviewed_at)}
                  {user.reviewer ? ` by ${user.reviewer.name}` : ""}
                </dd>
              </>
            )}
            {user.residency_note && (
              <>
                <dt className="text-muted">Reason given</dt>
                <dd className="m-0 break-words">{user.residency_note}</dd>
              </>
            )}
          </dl>

          {stale && (
            <Alert title="Refresh review" tone="warning">
              This review has changed. Refresh review to load the current account and proof before you decide.
            </Alert>
          )}
          {stale && (
            <Button type="button" className="self-start" disabled={refresh.pending} onClick={refreshReview}>
              {refresh.pending ? "Refreshing..." : "Refresh review"}
            </Button>
          )}
          {refresh.error && <Alert title="Could not refresh the review">{refresh.error.displayMessage}</Alert>}

          {!stale && (user.has_residency_proof ? (
            opened ? (
              opened.kind === "image" ? (
                <a href={opened.url} target="_blank" rel="noreferrer" className="block">
                  <img
                    src={opened.url}
                    alt={`Proof of residency uploaded by ${user.name}`}
                    width={400}
                    height={300}
                    className="h-auto max-h-80 w-full border border-divider object-contain"
                  />
                </a>
              ) : (
                <a href={opened.url} target="_blank" rel="noreferrer">
                  Open the PDF in a new tab
                </a>
              )
            ) : (
              <Button type="button" className="self-start" disabled={blocked || proofView.kind === "loading"} onClick={openProof}>
                {proofView.kind === "loading" ? "Opening..." : "Open proof"}
              </Button>
            )
          ) : (
            <p className="text-muted">
              No proof uploaded yet. You can approve without a document, with a reason that is kept in the activity log.
            </p>
          ))}
          {opened && <p className="text-muted text-[11px]">The link works for 5 minutes and every opening is logged.</p>}
          {proofView.kind === "error" && <Alert title="Could not open the proof">{proofView.error.displayMessage}</Alert>}

          {!stale && mode === "review" && user.has_residency_proof && step !== "verified" && (
            <fieldset className="flex flex-col gap-2 border border-divider p-3 m-0 min-w-0" aria-describedby="residency-checks-hint">
              <legend className="px-1 font-bold text-text">Before you accept the document</legend>
              <p id="residency-checks-hint" className="text-muted text-[12px] !m-0">
                {opened ? "Confirm all four." : "Open the proof first, then confirm all four."}
              </p>
              <ul className="flex flex-col gap-1 list-none !p-0 !m-0">
                {REVIEW_CHECKS.map((check) => (
                  <li key={check.id}>
                    <label className="flex items-start gap-2 min-h-[36px] px-1 py-1 cursor-pointer hover:bg-neutral-200">
                      <input
                        type="checkbox"
                        name="checks"
                        value={check.id}
                        checked={checks.has(check.id)}
                        disabled={!opened || blocked}
                        onChange={() => toggleCheck(check.id)}
                        className="size-4 mt-0.5 accent-accent shrink-0"
                      />
                      <span className="min-w-0 break-words">{check.label(user)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}

          {mode !== "review" && (
            <Field
              label={mode === "reject" ? "Reason" : "How you confirmed this resident"}
              htmlFor="residency-note"
              hint={
                mode === "reject"
                  ? "The citizen sees this when they upload again."
                  : "Kept in the activity log as an approval without a document. The citizen does not see it."
              }
              error={shownNoteError ?? review.error?.fieldErrors.note}
              count={note.length}
              max={RESIDENCY_NOTE_MAX}
            >
              <Textarea
                id="residency-note"
                name="note"
                rows={3}
                maxLength={RESIDENCY_NOTE_MAX}
                placeholder={
                  mode === "reject"
                    ? "e.g. The address on the bill is not in Makati…"
                    : "e.g. Saw the original barangay certificate at the barangay hall on 15 October…"
                }
                autoComplete="off"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
          )}

          {review.error && review.error.status !== 409 && !review.error.fieldErrors.note && <Alert title="Could not save the review">{review.error.displayMessage}</Alert>}
        </div>

        <div className="dialog-actions flex flex-wrap gap-3">
          {mode === "reject" ? (
            <>
              <Button
                type="button"
                variant="danger"
                disabled={blocked || Boolean(noteError)}
                onClick={() => decide("rejected")}
              >
                {review.pending ? "Saving…" : "Reject and ask again"}
              </Button>
              <Button type="button" onClick={() => chooseMode("review")} disabled={review.pending || refresh.pending}>
                Back
              </Button>
            </>
          ) : mode === "exception" ? (
            <>
              <Button
                type="button"
                variant="primary"
                disabled={blocked || Boolean(noteError)}
                onClick={() => decide("no_document")}
              >
                {review.pending ? "Saving…" : "Approve without a document"}
              </Button>
              <Button type="button" onClick={() => chooseMode("review")} disabled={review.pending || refresh.pending}>
                Back
              </Button>
            </>
          ) : (
            <>
              {step !== "verified" && user.has_residency_proof && (
                <Button type="button" variant="primary" disabled={blocked || !allChecked} onClick={() => decide("document")}>
                  {review.pending ? "Saving…" : "Accept the document"}
                </Button>
              )}
              {step !== "verified" && (
                <Button type="button" disabled={blocked} onClick={() => chooseMode("exception")}>
                  Approve without a document…
                </Button>
              )}
              {user.has_residency_proof && step !== "rejected" && (
                <Button type="button" variant="danger-outline" disabled={blocked} onClick={() => chooseMode("reject")}>
                  Reject…
                </Button>
              )}
              <Button ref={closeRef} type="button" variant="ghost" onClick={onClose} disabled={review.pending || refresh.pending}>
                Close
              </Button>
            </>
          )}
        </div>
    </ModalDialog>
  );
}
