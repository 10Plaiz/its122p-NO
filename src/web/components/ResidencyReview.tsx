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

export function validateResidencyNote(note: string): string | undefined {
  const trimmed = note.trim();
  if (trimmed.length < 5) return RESIDENCY_NOTE_ERROR;
  if (trimmed.length > RESIDENCY_NOTE_MAX) return "Keep the reason under 500 characters.";
  return undefined;
}

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
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const fields = useLeftFields();
  const closeRef = useRef<HTMLButtonElement>(null);

  const [proofView, setProofView] = useState<ProofView>({ kind: "idle" });
  const requestVersion = useRef(0);
  const opened = proofView.kind === "opened" ? proofView.proof : null;
  const review = useAction((body: { decision: "verified" | "rejected"; note?: string; expected_version: string }) =>
    api.patch<{ user: Profile }>(`/admin/users/${user.id}/residency`, body),
  );
  const refresh = useAction(() => api.get<{ user: Profile }>(`/admin/users/${user.id}`));
  const blocked = stale || review.pending || refresh.pending || user.role !== "citizen" || user.is_active === false;

  const step = residencyStep(user);
  const noteError = validateResidencyNote(note);
  const shownNoteError = fields.visible(noteError ? { "residency-note": noteError } : {})["residency-note"];

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => {
      requestVersion.current++;
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !review.pending) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, review.pending]);

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
    setRejecting(false);
    fields.reset();
    review.setError(null);
    const result = await refresh.run();
    if (!result || request !== requestVersion.current) return;
    setUser(result.user);
    setStale(false);
  }

  async function decide(decision: "verified" | "rejected") {
    if (blocked || (decision === "rejected" && noteError)) return;
    const request = requestVersion.current;
    const result = await review.run({
      decision,
      ...(decision === "rejected" ? { note: note.trim() } : {}),
      expected_version: user.residency_review_version,
    });
    if (request !== requestVersion.current) return;
    if (!result) return;
    toast(decision === "verified" ? `${user.name} is now a verified resident.` : `${user.name} was asked for a new proof.`);
    onDone();
  }

  useEffect(() => {
    if (review.error?.status !== 409) return;
    requestVersion.current++;
    setStale(true);
    setProofView({ kind: "idle" });
  }, [review.error]);

  return (
    <div className="dialog-backdrop z-[1100] overscroll-contain" role="presentation" onClick={onClose}>
      <div
        className="dialog max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="residency-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
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
            <p className="text-muted">No proof uploaded yet. You can still confirm a resident you know.</p>
          ))}
          {opened && <p className="text-muted text-[11px]">The link works for 5 minutes and every opening is logged.</p>}
          {proofView.kind === "error" && <Alert title="Could not open the proof">{proofView.error.displayMessage}</Alert>}

          {rejecting && (
            <Field
              label="Reason"
              htmlFor="residency-note"
              hint="The citizen sees this when they upload again."
              error={shownNoteError ?? review.error?.fieldErrors.note}
              count={note.length}
              max={RESIDENCY_NOTE_MAX}
            >
              <Textarea
                id="residency-note"
                name="note"
                rows={3}
                maxLength={RESIDENCY_NOTE_MAX}
                placeholder="e.g. The address on the bill is not in Makati…"
                autoComplete="off"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
          )}

          {review.error && review.error.status !== 409 && !review.error.fieldErrors.note && <Alert title="Could not save the review">{review.error.displayMessage}</Alert>}
        </div>

        <div className="dialog-actions flex flex-wrap gap-3">
          {rejecting ? (
            <>
              <Button
                type="button"
                variant="danger"
                disabled={blocked || Boolean(noteError)}
                onClick={() => decide("rejected")}
              >
                {review.pending ? "Saving…" : "Reject and ask again"}
              </Button>
              <Button type="button" onClick={() => setRejecting(false)} disabled={review.pending}>
                Back
              </Button>
            </>
          ) : (
            <>
              {step !== "verified" && (
                <Button type="button" variant="primary" disabled={blocked} onClick={() => decide("verified")}>
                  {review.pending ? "Saving…" : "Accept as resident"}
                </Button>
              )}
              {user.has_residency_proof && step !== "rejected" && (
                <Button type="button" variant="danger-outline" disabled={blocked} onClick={() => setRejecting(true)}>
                  Reject…
                </Button>
              )}
              <Button ref={closeRef} type="button" variant="ghost" onClick={onClose} disabled={review.pending}>
                Close
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
