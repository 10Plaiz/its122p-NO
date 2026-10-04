import { useEffect, useState } from "react";
import { Alert, Button, Field, Textarea, useLeftFields } from "./ui.js";
import { useToast } from "./Toast.js";
import { api } from "../lib/api.js";
import { CANCEL_REASON_MAX, validateCancelReason } from "../lib/report-rules.js";
import { useAction } from "../lib/useApi.js";
import type { Report } from "../lib/types.js";

// Dedicated confirmation dialog when withdrawing a pending report. The reason is
// required (SW-2): staff should never find a withdrawn report with no explanation.
export function CancelDialog({
  report,
  onClose,
  onDone,
}: {
  report: Report;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [details, setDetails] = useState("");
  const fields = useLeftFields();
  const reasonError = validateCancelReason(details);
  const shown = fields.visible(reasonError ? { "cancel-details": reasonError } : {});
  const { run, pending, error } = useAction((body: { details: string }) =>
    api.post<{ report: Report }>(`/reports/${report.id}/cancel`, body),
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, pending]);

  return (
    <div className="dialog-backdrop z-[1100]" role="presentation" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h4 id="cancel-dialog-title" className="dialog-title">
          Withdraw this report?
        </h4>

        <div className="dialog-body flex flex-col gap-3" onBlur={fields.onBlur}>
          <p className="text-[13px] text-muted">
            Are you sure you want to withdraw <strong>{report.title}</strong> ({report.reference_code})?
          </p>
          <p className="text-[12px] text-muted">
            The report will be marked as cancelled. Its history will be preserved, but municipal staff will no longer act on it.
          </p>

          <Field
            label="Reason"
            htmlFor="cancel-details"
            hint="Required. Municipal staff will see this in the report history."
            error={shown["cancel-details"] ?? error?.fieldErrors.details}
            count={details.length}
            max={CANCEL_REASON_MAX}
          >
            <Textarea
              id="cancel-details"
              rows={3}
              maxLength={CANCEL_REASON_MAX}
              required
              placeholder="e.g. Already fixed, or filed by mistake…"
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              disabled={pending}
            />
          </Field>

          {error && <Alert title="Could not cancel report">{error.message}</Alert>}
        </div>

        <div className="dialog-actions flex gap-3">
          <Button
            type="button"
            variant="danger"
            disabled={pending || Boolean(reasonError)}
            onClick={async () => {
              if (reasonError) return;
              const cancelled = await run({ details: details.trim() });
              if (cancelled) {
                toast("Report cancelled. Its history is kept.");
                onDone();
              }
            }}
          >
            {pending ? "Cancelling…" : "Yes, cancel"}
          </Button>
          <Button type="button" onClick={onClose} disabled={pending}>
            Keep it
          </Button>
        </div>
      </div>
    </div>
  );
}
