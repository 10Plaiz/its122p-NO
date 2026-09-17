import { db } from "../config/supabase.js";
import { badRequest, forbidden, notFound, orThrow } from "../lib/errors.js";
import type { AuthUser } from "../types/auth.js";

export type ReportStatus = "pending" | "under_review" | "in_progress" | "resolved" | "cancelled";
export type Report = {
  id: string;
  reference_code: string;
  status: ReportStatus;
  is_public: boolean;
  citizen: { id: string };
  assigned_staff: { id: string } | null;
  photos: { storage_path: string; [key: string]: unknown }[];
  [key: string]: unknown;
};

// The status flow from the proposal. A report moves forward one step at a time.
// "cancelled" is a dead end reached only by the citizen who filed the report.
const NEXT_STATUS: Record<ReportStatus, ReportStatus[]> = {
  pending: ["under_review"],
  under_review: ["in_progress"],
  in_progress: ["resolved"],
  resolved: [],
  cancelled: [],
};

// Every status a report can hold — used for filtering.
export const STATUSES = ["pending", "under_review", "in_progress", "resolved", "cancelled"] as const;

// The subset staff and admins can set. Only a citizen cancels their own report.
export const STAFF_STATUSES = ["under_review", "in_progress", "resolved"] as const;

// Every column the API returns for a report, with its related rows joined in.
const REPORT_FIELDS = `
  id, reference_code, title, description, status, latitude, longitude,
  address_text, is_public, submitted_at, updated_at, resolved_at,
  category:categories ( id, name ),
  citizen:profiles!reports_citizen_id_fkey ( id, name, email, contact_number ),
  assigned_staff:profiles!reports_assigned_staff_id_fkey ( id, name, email ),
  photos:report_photos ( id, kind, storage_path, created_at )
`;

export async function findReport(reportId: string | string[]) {
  if (typeof reportId !== "string") throw badRequest("A single report ID is required.");
  const { data } = await db.from("reports").select(REPORT_FIELDS).eq("id", reportId).single();
  if (!data) throw notFound("That report does not exist.");
  return data as unknown as Report;
}

// Citizens may only see their own reports; staff and admins may see any.
export function assertCanView(report: Report, user: AuthUser) {
  if (user.role === "admin" || user.role === "staff") return;
  if (report.citizen.id !== user.id) throw forbidden("You can only view your own reports.");
}

// Admins may act on any report; staff only on the ones assigned to them.
export function assertCanUpdate(report: Report, user: AuthUser) {
  if (user.role === "admin") return;
  if (user.role === "staff" && report.assigned_staff?.id === user.id) return;
  throw forbidden("You can only update reports assigned to you.");
}

// A citizen owns their report until staff pick it up. After that it is out of
// their hands, because staff may already be acting on what it says.
export function assertCanEdit(report: Report, user: AuthUser) {
  if (report.citizen.id !== user.id) throw forbidden("You can only change your own reports.");
  if (report.status !== "pending") {
    throw forbidden("This report is already being handled and can no longer be changed.");
  }
}

// Records a history entry and notifies the citizen who filed the report.
// Written as separate statements for readability; if partial writes ever become
// a problem, move these three into a single Postgres function and call it here.
type UpdateInput = { report: Report; actorId: string; updateType: string; previousStatus?: ReportStatus; newStatus?: ReportStatus; details?: string; message?: string };
async function recordUpdate({ report, actorId, updateType, previousStatus, newStatus, details, message }: UpdateInput) {
  orThrow(
    await db.from("report_updates").insert({
      report_id: report.id,
      updated_by: actorId,
      update_type: updateType,
      previous_status: previousStatus ?? null,
      new_status: newStatus ?? null,
      details: details ?? null,
    }),
    "The report changed but its history could not be saved.",
  );

  if (message) {
    orThrow(
      await db.from("notifications").insert({
        user_id: report.citizen.id,
        report_id: report.id,
        message,
      }),
      "The report changed but the citizen could not be notified.",
    );
  }
}

export async function changeStatus({ report, user, newStatus, details }: { report: Report; user: AuthUser; newStatus: ReportStatus; details?: string }) {
  if (report.status === newStatus) {
    throw badRequest(`This report is already marked "${newStatus}".`);
  }
  if (!NEXT_STATUS[report.status].includes(newStatus)) {
    const allowed = NEXT_STATUS[report.status];
    throw badRequest(
      allowed.length === 0
        ? `A ${report.status} report can no longer change status.`
        : `A "${report.status}" report can only move to "${allowed.join('" or "')}".`,
    );
  }

  const changes = {
    status: newStatus,
    resolved_at: newStatus === "resolved" ? new Date().toISOString() : null,
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
    message: `Report ${report.reference_code} is now "${newStatus}".`,
  });

  return updated as unknown as Report;
}

// Citizens correct their own report while it is still pending — a wrong pin or a
// vague description is easier to fix than to re-file.
export async function editReport({ report, user, changes }: { report: Report; user: AuthUser; changes: Record<string, unknown> }) {
  const updated = orThrow(
    await db.from("reports").update(changes).eq("id", report.id).select(REPORT_FIELDS).single(),
    "Your report could not be updated.",
  );

  await recordUpdate({
    report,
    actorId: user.id,
    updateType: "edit",
    details: `Edited by the reporter: ${Object.keys(changes).join(", ")}.`,
  });

  return updated as unknown as Report;
}

// Cancelling keeps the row so the history stays intact; it just leaves the queue.
export async function cancelReport({ report, user, details }: { report: Report; user: AuthUser; details?: string }) {
  const updated = orThrow(
    await db
      .from("reports")
      .update({ status: "cancelled", is_public: false })
      .eq("id", report.id)
      .select(REPORT_FIELDS)
      .single(),
    "Your report could not be cancelled.",
  );

  await recordUpdate({
    report,
    actorId: user.id,
    updateType: "status_change",
    previousStatus: report.status,
    newStatus: "cancelled",
    details: details ?? "Cancelled by the reporter.",
  });

  return updated as unknown as Report;
}

export async function assignStaff({ report, user, staffId }: { report: Report; user: AuthUser; staffId: string }) {
  const { data: staff } = await db
    .from("profiles")
    .select("id, name, role, is_active")
    .eq("id", staffId)
    .single();

  if (!staff || staff.role !== "staff") throw badRequest("That user is not a staff member.");
  if (!staff.is_active) throw badRequest("That staff account is deactivated.");

  const updated = orThrow(
    await db
      .from("reports")
      .update({ assigned_staff_id: staff.id })
      .eq("id", report.id)
      .select(REPORT_FIELDS)
      .single(),
    "The report could not be assigned.",
  );

  await recordUpdate({
    report,
    actorId: user.id,
    updateType: "assignment",
    details: `Assigned to ${staff.name}.`,
    message: `Report ${report.reference_code} has been assigned to a staff member.`,
  });

  return updated as unknown as Report;
}

export async function addRemark({ report, user, details }: { report: Report; user: AuthUser; details: string }) {
  await recordUpdate({
    report,
    actorId: user.id,
    updateType: "remark",
    details,
    message: `There is a new update on report ${report.reference_code}.`,
  });
}

export { REPORT_FIELDS };
