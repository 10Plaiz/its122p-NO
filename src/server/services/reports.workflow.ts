import { db } from "../config/supabase.js";
import { ApiError, badRequest, forbidden, orThrow, throwIfFailed } from "../lib/errors.js";
import type { AuthUser } from "../types/auth.js";
import { REPORT_FIELDS, recordUpdate, reportLabel, type Notice, type Report, type ReportStatus } from "./reports.common.js";

// The status flow from the proposal. A report moves forward one step at a time.
// "cancelled" is a dead end reached only by the citizen who filed the report.
// "in_progress" has no manual next step: the assigned staff member requests
// resolution and an administrator closes the report by verifying it (SW-4).
// "rejected" is reached the same way, from under review or in progress, when the
// report cannot be fixed (SW-7).
export const NEXT_STATUS: Record<ReportStatus, ReportStatus[]> = {
  pending: ["under_review"],
  under_review: ["in_progress"],
  in_progress: [],
  resolved: [],
  cancelled: [],
  rejected: [],
};

// Every status a report can hold — used for filtering.
export const STATUSES = ["pending", "under_review", "in_progress", "resolved", "cancelled", "rejected"] as const;

// The subset staff and admins can set by hand. Only a citizen cancels their own
// report, and only an administrator's verification resolves one.
export const STAFF_STATUSES = ["under_review", "in_progress"] as const;

// The only statuses the public board can show: a report appears once it leaves
// `pending`, and a cancelled one never appears. A rejected one stays, with its
// reason (decision 2026-10-03). These answer "what can be seen", which is a
// different question from STAFF_STATUSES' "what can be set".
export const PUBLIC_STATUSES = ["under_review", "in_progress", "resolved", "rejected"] as const;

// Statuses that still need work. Counts toward a staff member's open load.
export const OPEN_STATUSES = ["pending", "under_review", "in_progress"] as const;

// What a closure request asks for: the work is done (SW-4), or the report cannot be
// fixed (SW-7).
export const CLOSURE_OUTCOMES = ["resolved", "rejected"] as const;
export type ClosureOutcome = (typeof CLOSURE_OUTCOMES)[number];

// The status an approved request moves the report to.
const OUTCOME_STATUS: Record<ClosureOutcome, ReportStatus> = { resolved: "resolved", rejected: "rejected" };

// Where each request can start. Resolution needs the work under way; a report can
// be found unfixable as soon as it is reviewed, without starting work on it.
export const CLOSURE_FROM: Record<ClosureOutcome, readonly ReportStatus[]> = {
  resolved: ["in_progress"],
  rejected: ["under_review", "in_progress"],
};
// Every status a request can be waiting in, for the guarded updates below.
const REQUESTABLE: ReportStatus[] = ["under_review", "in_progress"];

// How long a report may sit in a status before it shows as delayed, in days.
// Mirrored in src/web/lib/types.ts. A closure request waiting for an administrator
// is measured separately, because the wait is then on the administrator.
export const DELAY_THRESHOLD_DAYS: Partial<Record<ReportStatus, number>> = {
  pending: 3,
  under_review: 5,
  in_progress: 14,
};
export const VERIFICATION_DELAY_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

// The workflow columns with the names of who requested and verified a closure.
// REPORT_FIELDS carries the columns but not these two names, which only the staff
// workbench shows.
const WORKFLOW_FIELDS = `
  assigned_at, status_changed_at, closure_requested_at, closure_outcome,
  closure_reason, verified_at,
  closure_requester:profiles!reports_closure_requested_by_fkey ( id, name ),
  verifier:profiles!reports_verified_by_fkey ( id, name )
`;

export type WorkflowRow = {
  assigned_at: string | null;
  status_changed_at: string | null;
  closure_requested_at: string | null;
  closure_outcome: ClosureOutcome | null;
  closure_reason: string | null;
  verified_at: string | null;
  closure_requester: { id: string; name: string } | null;
  verifier: { id: string; name: string } | null;
};

export async function findWorkflow(reportId: string) {
  return orThrow(
    await db.from("reports").select(WORKFLOW_FIELDS).eq("id", reportId).single(),
    "The report's workflow could not be loaded.",
  ) as unknown as WorkflowRow;
}

// A request is waiting for an administrator until it is approved or returned.
// Returning clears it, so only an approved request has verified_at.
export function closurePending(workflow: Pick<WorkflowRow, "closure_requested_at" | "verified_at">) {
  return Boolean(workflow.closure_requested_at) && !workflow.verified_at;
}

export type DelayStage = ReportStatus | "awaiting_verification";

// How long the report has waited at its current stage, and whether that is past the
// stage's threshold. Terminal statuses are never delayed.
export function delayState(
  { status, statusSince, closureRequestedAt, awaitingVerification }: {
    status: ReportStatus;
    statusSince: string;
    closureRequestedAt?: string | null;
    awaitingVerification?: boolean;
  },
  now: Date = new Date(),
) {
  const waitingOnAdmin = Boolean(awaitingVerification && closureRequestedAt);
  const stage: DelayStage = waitingOnAdmin ? "awaiting_verification" : status;
  const since = waitingOnAdmin ? (closureRequestedAt as string) : statusSince;
  const threshold = waitingOnAdmin ? VERIFICATION_DELAY_DAYS : DELAY_THRESHOLD_DAYS[status];

  const elapsed = Math.max(0, now.getTime() - new Date(since).getTime());
  const days = Math.floor(elapsed / DAY_MS);

  if (threshold === undefined) return { stage, since, days, threshold_days: null, delayed: false, days_over: 0 };

  const delayed = elapsed > threshold * DAY_MS;
  return { stage, since, days, threshold_days: threshold, delayed, days_over: delayed ? days - threshold : 0 };
}

// The response for GET /api/reports/:id/workflow: the dates staff need (SW-6) and
// the state of any closure request (SW-4).
export function presentWorkflow(report: Report, workflow: WorkflowRow, now: Date = new Date()) {
  const pending = closurePending(workflow);
  const statusSince = workflow.status_changed_at ?? (report.submitted_at as string);

  return {
    submitted_at: report.submitted_at as string,
    assigned_at: workflow.assigned_at,
    status_since: statusSince,
    completed_at: (report.resolved_at as string | null) ?? null,
    delay: delayState(
      {
        status: report.status,
        statusSince,
        closureRequestedAt: workflow.closure_requested_at,
        awaitingVerification: pending,
      },
      now,
    ),
    closure: workflow.closure_requested_at
      ? {
          pending,
          requested_at: workflow.closure_requested_at,
          requested_by: workflow.closure_requester,
          outcome: workflow.closure_outcome,
          reason: workflow.closure_reason,
        }
      : null,
    verified_at: workflow.verified_at,
    verified_by: workflow.verifier,
  };
}

export async function changeStatus({ report, user, newStatus, details }: { report: Report; user: AuthUser; newStatus: ReportStatus; details: string }) {
  if (report.status === newStatus) {
    throw badRequest(`This report is already marked "${newStatus}".`);
  }
  if (report.status === "in_progress") {
    throw badRequest("A report in progress is closed by requesting resolution, which an administrator then verifies.");
  }
  // A rejection asked for under review waits for an administrator; work does not
  // start around it. REPORT_FIELDS carries both columns.
  const waiting = closurePending({
    closure_requested_at: (report.closure_requested_at as string | null) ?? null,
    verified_at: (report.verified_at as string | null) ?? null,
  });
  if (waiting) {
    throw badRequest("This report is waiting for an administrator to verify a request. Decide on that first.");
  }
  if (!NEXT_STATUS[report.status].includes(newStatus)) {
    const allowed = NEXT_STATUS[report.status];
    throw badRequest(
      allowed.length === 0
        ? `A ${report.status} report can no longer change status.`
        : `A "${report.status}" report can only move to "${allowed.join('" or "')}".`,
    );
  }
  // Only the assigned staff member can request resolution, so work started with
  // nobody assigned could never be closed.
  if (newStatus === "in_progress" && !report.assigned_staff) {
    throw badRequest("Assign a staff member before work begins. Only they can request resolution.");
  }

  const changes = {
    status: newStatus,
    status_changed_at: new Date().toISOString(),
    // A report reaches the public board once staff have reviewed it.
    is_public: report.is_public || newStatus !== "pending",
  };

  const updated = orThrow(
    await db.from("reports").update(changes).eq("id", report.id).select(REPORT_FIELDS).single(),
    "The report status could not be updated.",
  );

  await recordUpdate({
    report,
    actorId: user.id,
    updateType: "status_change",
    previousStatus: report.status,
    newStatus,
    details,
    notify: [
      { userId: report.citizen.id, message: `Report ${report.reference_code} is now "${newStatus}".` },
      // Only reaches the assignee when somebody else moved it — an admin acting on
      // a report that is somebody's job.
      { userId: report.assigned_staff?.id, message: `${reportLabel(report)} was moved to "${newStatus}".` },
    ],
  });

  return updated as unknown as Report;
}

export async function assignStaff({ report, user, staffId, details }: { report: Report; user: AuthUser; staffId: string; details: string }) {
  const { data: staff } = await db
    .from("profiles")
    .select("id, name, role, is_active")
    .eq("id", staffId)
    .single();

  if (!staff || staff.role !== "staff") throw badRequest("That user is not a staff member.");
  if (!staff.is_active) throw badRequest("That staff account is deactivated.");

  // Read before the row is overwritten. Left undefined when the report is simply
  // being assigned again to the same person, who should not be told they lost it.
  const sameStaff = report.assigned_staff?.id === staff.id;
  const previousStaffId = sameStaff ? undefined : report.assigned_staff?.id;

  // assigned_at is when the current holder got it, so a repeat assignment to the
  // same person keeps the original date.
  const changes = sameStaff
    ? { assigned_staff_id: staff.id }
    : { assigned_staff_id: staff.id, assigned_at: new Date().toISOString() };

  const updated = orThrow(
    await db.from("reports").update(changes).eq("id", report.id).select(REPORT_FIELDS).single(),
    "The report could not be assigned.",
  );

  await recordUpdate({
    report,
    actorId: user.id,
    updateType: "assignment",
    details: `Assigned to ${staff.name}. ${details}`,
    notify: [
      {
        userId: report.citizen.id,
        message: `Report ${report.reference_code} has been assigned to a staff member.`,
      },
      { userId: staff.id, message: `${reportLabel(report)} has been assigned to you.` },
      // The previous holder loses it from their queue; being told beats it simply
      // disappearing.
      {
        userId: previousStaffId,
        message: `${reportLabel(report)} has been reassigned to someone else.`,
      },
    ],
  });

  return { report: updated as unknown as Report, staff: { id: staff.id as string, name: staff.name as string } };
}

// Every active administrator, for notices that are everyone's business.
async function activeAdminIds(failure: string) {
  const admins = orThrow(
    await db.from("profiles").select("id").eq("role", "admin").eq("is_active", true),
    failure,
  ) as { id: string }[];
  return admins.map((admin) => admin.id);
}

export async function addRemark({ report, user, details }: { report: Report; user: AuthUser; details: string }) {
  // RS-6: the reporter's own comment, at any status. It reaches the assigned staff
  // member and every administrator (decision 2026-10-03), so it is never missed on
  // a report nobody has picked up yet.
  if (user.role === "citizen") {
    const admins = await activeAdminIds("The comment could not be saved because administrators could not be found.");
    await recordUpdate({
      report,
      actorId: user.id,
      updateType: "remark",
      details,
      notify: [
        { userId: report.assigned_staff?.id, message: `The reporter commented on ${reportLabel(report)}.` },
        ...admins
          .filter((id) => id !== report.assigned_staff?.id)
          .map((id): Notice => ({ userId: id, message: `The reporter commented on ${reportLabel(report)}.` })),
      ],
    });
    return;
  }

  await recordUpdate({
    report,
    actorId: user.id,
    updateType: "remark",
    details,
    notify: [
      {
        userId: report.citizen.id,
        message: `There is a new update on report ${report.reference_code}.`,
      },
      // Reaches the assignee only when an admin left the remark, never when they
      // left it themselves.
      { userId: report.assigned_staff?.id, message: `A remark was added to ${reportLabel(report)}.` },
    ],
  });
}

// Only the staff member on the report can ask for it to be closed, once at a time.
// Resolution needs the work in progress and proof of repair; rejection needs only
// the reason, from under review or in progress (SW-7).
export function assertCanRequestClosure(
  report: Report,
  user: AuthUser,
  workflow: Pick<WorkflowRow, "closure_requested_at" | "verified_at">,
  outcome: ClosureOutcome = "resolved",
) {
  if (user.role !== "staff" || report.assigned_staff?.id !== user.id) {
    throw forbidden("Only the staff member assigned to this report can ask for it to be closed.");
  }
  if (!CLOSURE_FROM[outcome].includes(report.status)) {
    throw badRequest(
      outcome === "resolved"
        ? "Only a report in progress can be sent for verification."
        : "Only a report under review or in progress can be rejected.",
    );
  }
  if (closurePending(workflow)) {
    throw badRequest("This report is already waiting for an administrator to verify it.");
  }
  if (outcome === "resolved" && !(report.photos ?? []).some((photo) => photo.kind === "resolution")) {
    throw badRequest("Upload at least one proof-of-repair photo before requesting resolution.");
  }
}

// An administrator can only decide on a request that is still waiting.
export function assertCanReviewClosure(report: Report, workflow: Pick<WorkflowRow, "closure_requested_at" | "verified_at">) {
  if (!REQUESTABLE.includes(report.status) || !closurePending(workflow)) {
    throw badRequest("This report has no request waiting for verification.");
  }
}

// Somebody else decided first (two tabs, two administrators). The guarded update
// matched no row, so nothing changed.
const alreadyDecided = () =>
  new ApiError(409, "This request was already handled. Reload the report to see its current state.");

export async function requestClosure({ report, user, details, outcome }: { report: Report; user: AuthUser; details: string; outcome: ClosureOutcome }) {
  assertCanRequestClosure(report, user, await findWorkflow(report.id), outcome);

  const { data, error } = await db
    .from("reports")
    .update({
      closure_requested_at: new Date().toISOString(),
      closure_requested_by: user.id,
      closure_outcome: outcome,
      closure_reason: details,
    })
    .eq("id", report.id)
    .in("status", CLOSURE_FROM[outcome])
    .is("closure_requested_at", null)
    .select("id");
  throwIfFailed({ error }, "The request could not be saved.");
  if (!data || data.length === 0) throw alreadyDecided();

  const admins = await activeAdminIds("The request was saved but administrators could not be found.");

  const rejecting = outcome === "rejected";
  await recordUpdate({
    report,
    actorId: user.id,
    updateType: "closure_request",
    details: rejecting ? `Rejection requested: ${details}` : details,
    notify: [
      {
        userId: report.citizen.id,
        message: rejecting
          ? `Staff found that report ${report.reference_code} cannot be fixed. An administrator will review the reason.`
          : `Work on report ${report.reference_code} is finished and waiting for verification.`,
      },
      ...admins.map((id): Notice => ({
        userId: id,
        message: rejecting
          ? `${reportLabel(report)}: staff asked to reject it. It is waiting for your verification.`
          : `${reportLabel(report)} is waiting for your verification.`,
      })),
    ],
  });
}

export async function reviewClosure({ report, user, decision, details }: { report: Report; user: AuthUser; decision: "approve" | "return"; details: string }) {
  const workflow = await findWorkflow(report.id);
  assertCanReviewClosure(report, workflow);

  // The requester may have been replaced since asking; both should hear back.
  const staffIds = [...new Set([report.assigned_staff?.id, workflow.closure_requester?.id])];
  const tellStaff = (message: string): Notice[] => staffIds.map((userId) => ({ userId, message }));

  if (decision === "return") {
    const { data, error } = await db
      .from("reports")
      .update({ closure_requested_at: null, closure_requested_by: null, closure_outcome: null, closure_reason: null })
      .eq("id", report.id)
      .in("status", REQUESTABLE)
      .not("closure_requested_at", "is", null)
      .is("verified_at", null)
      .select(REPORT_FIELDS)
      .maybeSingle();
    throwIfFailed({ error }, "The request could not be returned.");
    if (!data) throw alreadyDecided();

    await recordUpdate({
      report,
      actorId: user.id,
      updateType: "verification",
      details: `Returned for more work. ${details}`,
      notify: tellStaff(`${reportLabel(report)} was returned for more work: ${details}`),
    });

    return { report: data as unknown as Report, outcome: null };
  }

  const newStatus = workflow.closure_outcome ? OUTCOME_STATUS[workflow.closure_outcome] : undefined;
  if (!newStatus) throw badRequest("This request asks for an outcome that cannot be applied. Return it instead.");

  const now = new Date().toISOString();
  const { data, error } = await db
    .from("reports")
    .update({
      status: newStatus,
      resolved_at: newStatus === "resolved" ? now : null,
      status_changed_at: now,
      verified_by: user.id,
      verified_at: now,
      is_public: true,
    })
    .eq("id", report.id)
    .in("status", REQUESTABLE)
    .not("closure_requested_at", "is", null)
    .is("verified_at", null)
    .select(REPORT_FIELDS)
    .maybeSingle();
  throwIfFailed({ error }, "The report could not be closed.");
  if (!data) throw alreadyDecided();

  await recordUpdate({
    report,
    actorId: user.id,
    updateType: "verification",
    previousStatus: report.status,
    newStatus,
    details,
    notify: [
      {
        userId: report.citizen.id,
        // The citizen needs the reason, not just the word (SW-7).
        message:
          newStatus === "rejected"
            ? `Report ${report.reference_code} was rejected: ${workflow.closure_reason ?? details}`
            : `Report ${report.reference_code} is now "${newStatus}".`,
      },
      ...tellStaff(`${reportLabel(report)} was verified and closed as "${newStatus}".`),
    ],
  });

  return { report: data as unknown as Report, outcome: workflow.closure_outcome };
}
