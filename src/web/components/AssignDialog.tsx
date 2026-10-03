import { useEffect, useRef, useState } from "react";
import { Alert, Button, Field, Loading, Select, Textarea, useLeftFields } from "./ui.js";
import { api } from "../lib/api.js";
import { useAction, useApi } from "../lib/useApi.js";
import type { Report, StaffOption } from "../lib/types.js";

const COMMENT_MAX = 500;

function openLoadLabel(count: number) {
  return count === 1 ? "1 open report" : `${count} open reports`;
}

// Wireframe 1p's dialog. Only active staff are offered; the server checks the role
// and is_active again in assignStaff(). Specialists in the report's category come
// first (SW-1), each with how much open work they already hold, and the assignment
// needs a comment (SW-2) that goes into the report's history.
export function AssignDialog({
  report,
  onClose,
  onDone,
}: {
  report: Report;
  onClose: () => void;
  onDone: () => void;
}) {
  const [staffId, setStaffId] = useState(report.assigned_staff?.id ?? "");
  const [details, setDetails] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const fields = useLeftFields();

  // Ranked by the server: specialists first, then least open work.
  const { data, loading, error: loadError } = useApi<{ staff: StaffOption[] }>("/staff", {
    category_id: report.category?.id,
  });
  const { run, pending, error } = useAction((body: { staff_id: string; details: string }) =>
    api.patch<{ report: Report }>(`/reports/${report.id}/assign`, body),
  );

  const staff = data?.staff ?? [];
  const specialists = staff.filter((member) => member.is_specialist);
  const others = staff.filter((member) => !member.is_specialist);
  const chosen = staff.find((member) => member.id === staffId);

  const errors: Record<string, string> = {};
  if (!details.trim()) errors["assign-comment"] = "Write why this person should take the report.";
  const shown = fields.visible(errors);
  const invalid = !staffId || Object.keys(errors).length > 0;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>("#staff, button:not([disabled])")?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;

      const controls = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button:not([disabled]), select:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
        ),
      );
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  useEffect(() => {
    if (!loading && staff.length > 0) {
      const dialog = dialogRef.current;
      const staffSelect = dialog?.querySelector<HTMLElement>("#staff");
      const active = document.activeElement;
      if (
        staffSelect &&
        (active?.textContent?.trim() === "Cancel" || !dialog?.contains(active))
      ) {
        staffSelect.focus();
      }
    }
  }, [loading, staff.length]);

  return (
    // ds.css already makes .dialog-backdrop a fixed, centred overlay. Only the
    // stacking order is added here, the level every dialog shares. Google's map
    // keeps its layers inside its own z-index 0 context, so any dialog clears it.
    <div className="dialog-backdrop z-[1100]" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h4 id="assign-title" className="dialog-title">
          Assign this report
        </h4>

        <div className="dialog-body flex flex-col gap-3" onBlur={fields.onBlur}>
          <p className="text-[13px] text-muted">
            {report.title}
            {report.category && <> &middot; {report.category.name}</>}
          </p>

          {loading && <Loading label="Loading staff" />}

          {loadError && <Alert title="Could not load staff">{loadError.message}</Alert>}

          {!loading && !loadError && staff.length === 0 && (
            <Alert title="No staff to assign">
              Create a staff account first, on the Users screen.
            </Alert>
          )}

          {staff.length > 0 && (
            <Field
              label="Staff member"
              htmlFor="staff"
              // A hint rather than an error: with Assign disabled until someone is
              // picked, there is no failed attempt to report, only a step still to take.
              hint={
                chosen
                  ? `${chosen.specializations.length > 0 ? `Handles ${chosen.specializations.map((category) => category.name).join(", ")}. ` : ""}Holds ${openLoadLabel(chosen.open_load)}.`
                  : specialists.length > 0
                    ? "Specialists in this category are listed first."
                    : "Nobody specialises in this category yet. Staff are listed by open work."
              }
            >
              <Select id="staff" value={staffId} onChange={(event) => setStaffId(event.target.value)}>
                <option value="">Choose a staff member</option>
                {specialists.length > 0 && (
                  <optgroup label={`Specialists in ${report.category?.name ?? "this category"}`}>
                    {specialists.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} — Specialist, {openLoadLabel(member.open_load)}
                      </option>
                    ))}
                  </optgroup>
                )}
                {others.length > 0 && (
                  <optgroup label={specialists.length > 0 ? "Other staff" : "Staff"}>
                    {others.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} — {openLoadLabel(member.open_load)}
                      </option>
                    ))}
                  </optgroup>
                )}
              </Select>
            </Field>
          )}

          {staff.length > 0 && (
            <Field
              label="Comment"
              htmlFor="assign-comment"
              hint="Required. Shown in the report's history, which the citizen can read."
              error={shown["assign-comment"] ?? error?.fieldErrors.details}
              count={details.length}
              max={COMMENT_MAX}
            >
              <Textarea
                id="assign-comment"
                rows={3}
                maxLength={COMMENT_MAX}
                required
                value={details}
                onChange={(event) => setDetails(event.target.value)}
              />
            </Field>
          )}

          {error && <Alert title="Could not assign">{error.message}</Alert>}
        </div>

        <div className="dialog-actions flex gap-3">
          <Button
            type="button"
            variant="primary"
            // An incomplete form is something it already knows is not a request worth
            // sending, so the button says so rather than accepting the click and
            // silently doing nothing.
            disabled={pending || staff.length === 0 || invalid}
            onClick={async () => {
              if (invalid) return;
              const done = await run({ staff_id: staffId, details: details.trim() });
              if (done) onDone();
            }}
          >
            {pending ? "Assigning…" : "Assign"}
          </Button>
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
