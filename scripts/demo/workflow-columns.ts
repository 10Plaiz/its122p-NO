import type { DemoReport } from "./generate_seed.js";

// Report columns added after the demo generator was written: the main problem
// (RS-4), the workflow dates (SW-6), and the closure record a resolved report now
// needs, a staff request that an administrator verified (SW-4). Derived from each
// report's own history, so the manifest and its fingerprint stay as they are.
export function workflowColumns(
  report: Pick<DemoReport, "status" | "submitted_at" | "updates">,
  ids: { adminId: string; staffId: string | null; mainProblemId: number | null },
) {
  const assignment = report.updates.find((update) => update.update_type === "assignment");
  const statusChanges = report.updates.filter((update) => update.update_type === "status_change");
  const resolvedStep = statusChanges.find((update) => update.new_status === "resolved");

  const columns: Record<string, unknown> = {
    primary_problem_id: ids.mainProblemId,
    assigned_at: assignment?.created_at ?? null,
    status_changed_at: statusChanges.at(-1)?.created_at ?? report.submitted_at,
  };

  // A resolved report was asked for by its staff member and verified by an
  // administrator; the database checks that the request is complete.
  if (report.status === "resolved" && resolvedStep && ids.staffId) {
    Object.assign(columns, {
      closure_requested_at: resolvedStep.created_at,
      closure_requested_by: ids.staffId,
      closure_outcome: "resolved",
      closure_reason: "Repair completed; proof of repair attached.",
      verified_at: resolvedStep.created_at,
      verified_by: ids.adminId,
    });
  }
  return columns;
}

// "Juan Dela Cruz" -> first "Juan", last "Dela Cruz". Demo names are a first name
// and a surname, so the first word is the given name.
export function nameParts(name: string) {
  const [first, ...rest] = name.trim().split(/\s+/);
  return { first_name: first ?? name, last_name: rest.join(" ") || null };
}
