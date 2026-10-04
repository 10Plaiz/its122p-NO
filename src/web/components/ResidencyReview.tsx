import { useEffect, useRef, useState } from "react";
import { useToast } from "./Toast.js";
import { Alert, Button, Field, StatusPill, Textarea, formatDate, useLeftFields } from "./ui.js";
import { api } from "../lib/api.js";
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

type Proof = { url: string; kind: "image" | "pdf"; expires_in: number };

// UA-8. An administrator opens a citizen's proof through a five-minute link and
// accepts or rejects it. Rejecting needs a reason: the citizen reads it on the
// upload screen they are sent back to.
export function ResidencyReview({
  user,
  onClose,
  onDone,
}: {
  user: Profile;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const fields = useLeftFields();
  const closeRef = useRef<HTMLButtonElement>(null);

  const proof = useAction(() => api.get<Proof>(`/admin/users/${user.id}/residency-proof`));
  const [opened, setOpened] = useState<Proof | null>(null);
  const review = useAction((body: { decision: "verified" | "rejected"; note?: string }) =>
    api.patch<{ user: Profile }>(`/admin/users/${user.id}/residency`, body),
  );

  const step = residencyStep(user);
  const noteError = validateResidencyNote(note);
  const shownNoteError = fields.visible(noteError ? { "residency-note": noteError } : {})["residency-note"];

  // Focus moves in on open and back to the row's button on close.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => previous?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !review.pending) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, review.pending]);

  async function openProof() {
    const result = await proof.run();
    if (result) setOpened(result);
  }

  async function decide(decision: "verified" | "rejected") {
    const result = await review.run(decision === "rejected" ? { decision, note: note.trim() } : { decision });
    if (!result) return;
    toast(decision === "verified" ? `${user.name} is now a verified resident.` : `${user.name} was asked for a new proof.`);
    onDone();
  }

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

          {user.has_residency_proof ? (
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
              <Button type="button" className="self-start" disabled={proof.pending} onClick={openProof}>
                {proof.pending ? "Opening…" : "Open proof"}
              </Button>
            )
          ) : (
            <p className="text-muted">No proof uploaded yet. You can still confirm a resident you know.</p>
          )}
          {opened && <p className="text-muted text-[11px]">The link works for 5 minutes and every opening is logged.</p>}
          {proof.error && <Alert title="Could not open the proof">{proof.error.message}</Alert>}

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
                rows={3}
                maxLength={RESIDENCY_NOTE_MAX}
                placeholder="e.g. The address on the bill is not in Makati…"
                autoComplete="off"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
          )}

          {review.error && !review.error.fieldErrors.note && <Alert title="Could not save the review">{review.error.message}</Alert>}
        </div>

        <div className="dialog-actions flex flex-wrap gap-3">
          {rejecting ? (
            <>
              <Button
                type="button"
                variant="danger"
                disabled={review.pending || Boolean(noteError)}
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
                <Button type="button" variant="primary" disabled={review.pending} onClick={() => decide("verified")}>
                  {review.pending ? "Saving…" : "Accept as resident"}
                </Button>
              )}
              {user.has_residency_proof && step !== "rejected" && (
                <Button type="button" variant="danger-outline" disabled={review.pending} onClick={() => setRejecting(true)}>
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
