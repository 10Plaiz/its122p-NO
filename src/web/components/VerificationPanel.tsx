import { useState } from "react";
import { useToast } from "./Toast.js";
import { Alert, Button, Field, Textarea, formatDateTime, useLeftFields } from "./ui.js";
import { api } from "../lib/api.js";
import { useAction } from "../lib/useApi.js";
import { STATUS_LABEL } from "../lib/types.js";
import type { Report, ReportWorkflow } from "../lib/types.js";

const COMMENT_MAX = 500;

type Decision = "approve" | "return";

// The administrator's half of SW-4 and SW-7. Staff asked for this report to be
// closed, as resolved (with proof of repair) or as rejected (with a reason that
// becomes public). The administrator approves, which closes it, or returns it with
// a reason, which puts it back in the staff member's hands. Both need a comment
// (SW-2).
export function VerificationPanel({
  report,
  closure,
  onDone,
}: {
  report: Report;
  closure: NonNullable<ReportWorkflow["closure"]>;
  onDone: () => void;
}) {
  const toast = useToast();
  const [details, setDetails] = useState("");
  const [deciding, setDeciding] = useState<Decision | null>(null);
  const fields = useLeftFields();

  const { run, pending, error } = useAction((body: { decision: Decision; details: string }) =>
    api.post<{ report: Report }>(`/reports/${report.id}/closure-review`, body),
  );

  const proofCount = report.photos.filter((photo) => photo.kind === "resolution").length;
  const rejecting = closure.outcome === "rejected";
  const outcomeLabel = rejecting ? STATUS_LABEL.rejected : STATUS_LABEL.resolved;
  const invalid = details.trim().length === 0;
  const shown = fields.visible(invalid ? { "verify-comment": "Write the reason for your decision." } : {});

  async function decide(decision: Decision) {
    if (invalid) return;
    setDeciding(decision);
    const done = await run({ decision, details: details.trim() });
    setDeciding(null);
    if (done) {
      setDetails("");
      fields.reset();
      toast(decision === "approve" ? `Report closed as ${outcomeLabel.toLowerCase()}.` : "Request returned to staff.");
      onDone();
    }
  }

  return (
    <section
      className="bg-surface border-2 border-warning-700 p-4 flex flex-col gap-3"
      aria-labelledby="verify-title"
      onBlur={fields.onBlur}
    >
      <h6 id="verify-title" className="text-[13px] font-bold text-text !m-0 !normal-case tracking-normal">
        {rejecting ? "Verify rejection" : "Verify resolution"}
      </h6>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px] !m-0">
        <dt className="text-neutral-700">Requested by</dt>
        <dd className="!m-0 min-w-0 break-words">{closure.requested_by?.name ?? "Unknown staff member"}</dd>
        <dt className="text-neutral-700">Requested</dt>
        <dd className="!m-0 font-mono text-[12px]">{formatDateTime(closure.requested_at)}</dd>
        <dt className="text-neutral-700">Outcome asked</dt>
        <dd className="!m-0">{outcomeLabel}</dd>
        {!rejecting && (
          <>
            <dt className="text-neutral-700">Proof of repair</dt>
            <dd className="!m-0">
              {proofCount === 1 ? "1 photo" : `${proofCount} photos`}, shown under Photo evidence
            </dd>
          </>
        )}
      </dl>

      {closure.reason && (
        <p className="text-[12px] text-neutral-700 !m-0">
          {rejecting ? "Reason given. If you approve, it is shown on the public board." : "What was done"}
        </p>
      )}
      {closure.reason && (
        <blockquote className="text-[13px] text-neutral-800 bg-bg border border-divider/60 p-2 leading-relaxed whitespace-pre-line break-words !m-0">
          {closure.reason}
        </blockquote>
      )}

      <Field
        label="Comment"
        htmlFor="verify-comment"
        hint="Required. Staff read this either way; if you return the report, say what is still needed."
        error={shown["verify-comment"] ?? error?.fieldErrors.details}
        count={details.length}
        max={COMMENT_MAX}
      >
        <Textarea
          id="verify-comment"
          rows={3}
          maxLength={COMMENT_MAX}
          required
          value={details}
          onChange={(event) => setDetails(event.target.value)}
        />
      </Field>

      {error && <Alert title="Could not record the decision">{error.message}</Alert>}

      <div className="flex gap-3 flex-wrap">
        <Button type="button" variant="primary" disabled={pending || invalid} onClick={() => decide("approve")}>
          {pending && deciding === "approve" ? "Closing…" : `Approve and close as ${outcomeLabel.toLowerCase()}`}
        </Button>
        <Button type="button" disabled={pending || invalid} onClick={() => decide("return")}>
          {pending && deciding === "return" ? "Returning…" : rejecting ? "Return to staff" : "Return for more work"}
        </Button>
      </div>
    </section>
  );
}
