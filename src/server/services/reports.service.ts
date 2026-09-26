import { db } from "../config/supabase.js";
import { badRequest, forbidden, notFound, orThrow, throwIfFailed } from "../lib/errors.js";
import type { AuthUser } from "../types/auth.js";

export type ReportStatus = "pending" | "under_review" | "in_progress" | "resolved" | "cancelled";
export type Report = {
  id: string;
  reference_code: string;
  title: string;
  status: ReportStatus;
  is_public: boolean;
  citizen: { id: string };
  assigned_staff: { id: string } | null;
  photos: { storage_path: string; [key: string]: unknown }[];
  [key: string]: unknown;
};

// The status flow from the proposal. A report moves forward one step at a time.
// "cancelled" is a dead end reached only by the citizen who filed the report.
export const NEXT_STATUS: Record<ReportStatus, ReportStatus[]> = {
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

// The only statuses the public board can show: a report appears once it leaves
// `pending`, and a cancelled one never appears. Identical to STAFF_STATUSES today
// by coincidence — these answer "what can be seen", not "what can be set" — so the
// two are kept apart deliberately.
export const PUBLIC_STATUSES = ["under_review", "in_progress", "resolved"] as const;

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

// Citizens may only view their own reports; assigned staff may only view reports
// assigned to them; admins may view any report.
export function assertCanView(report: Report, user: AuthUser) {
  if (user.role === "admin") return;
  if (user.role === "staff") {
    if (report.assigned_staff?.id === user.id) return;
    throw forbidden("You can only view reports assigned to you.");
  }
  if (user.role === "citizen") {
    if (report.citizen?.id === user.id) return;
    throw forbidden("You can only view your own reports.");
  }
  throw forbidden("You do not have permission to view this report.");
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

// Staff work many reports at once, so their notifications name the job rather than
// only its code. The text is stored as it was sent: a title edited later does not
// rewrite a notification already delivered.
function reportLabel(report: Report) {
  return `${report.reference_code} “${report.title}”`;
}

// Who to tell about a change. The citizen and the assigned staff member get
// different wording for the same event, because they need different things from
export type Notice = { userId: string | undefined; message: string };

export function filterNotificationRecipients(
  notify: Notice[] | undefined,
  actorId: string,
): { userId: string; message: string }[] {
  return (notify ?? []).filter(
    (notice): notice is { userId: string; message: string } =>
      Boolean(notice.userId) && notice.userId !== actorId,
  );
}

// Records a history entry and tells everyone the change concerns.
// Written as separate statements for readability; if partial writes ever become
// a problem, move these into a single Postgres function and call it here.
type UpdateInput = { report: Report; actorId: string; updateType: string; previousStatus?: ReportStatus; newStatus?: ReportStatus; details?: string; notify?: Notice[] };
async function recordUpdate({ report, actorId, updateType, previousStatus, newStatus, details, notify }: UpdateInput) {
  throwIfFailed(
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

  // Nobody is told about their own action, and an unassigned report has no staff
  // member to tell.
  const recipients = filterNotificationRecipients(notify, actorId);

  if (recipients.length === 0) return;

  throwIfFailed(
    await db.from("notifications").insert(
      recipients.map((notice) => ({
        user_id: notice.userId,
        report_id: report.id,
        message: notice.message,
      })),
    ),
    "The report changed but someone could not be notified.",
  );
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
    notify: [
      { userId: report.citizen.id, message: `Report ${report.reference_code} is now "${newStatus}".` },
      // Only reaches the assignee when somebody else moved it — an admin acting on
      // a report that is somebody's job.
      { userId: report.assigned_staff?.id, message: `${reportLabel(report)} was moved to "${newStatus}".` },
    ],
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
    // A report can be assigned while it is still pending, so a withdrawal can land
    // on somebody already treating it as their job.
    notify: [
      {
        userId: report.assigned_staff?.id,
        message: `${reportLabel(report)} was cancelled by the reporter.`,
      },
    ],
  });

  return updated as unknown as Report;
}

// A category id passing the schema only means it is a positive integer. The foreign
// key then guarantees the row exists, but says nothing about whether it is one a
// citizen may still choose: so a retired category was accepted, and a missing one
// surfaced as a constraint violation rather than a field error. Checked here for the
// same reason assignStaff checks `is_active` on a staff member.
export async function assertCategorySelectable(categoryId: number) {
  const { data: category } = await db
    .from("categories")
    .select("id, is_active")
    .eq("id", categoryId)
    .single();

  if (!category) throw badRequest("Some fields are invalid. Fix them and try again.", [
    { field: "category_id", message: "Choose a category that exists." },
  ]);

  if (!category.is_active) throw badRequest("Some fields are invalid. Fix them and try again.", [
    { field: "category_id", message: "That category has been retired. Choose another." },
  ]);
}

export async function assignStaff({ report, user, staffId }: { report: Report; user: AuthUser; staffId: string }) {
  const { data: staff } = await db
    .from("profiles")
    .select("id, name, role, is_active")
    .eq("id", staffId)
    .single();

  if (!staff || staff.role !== "staff") throw badRequest("That user is not a staff member.");
  if (!staff.is_active) throw badRequest("That staff account is deactivated.");

  // Read before the row is overwritten. Left undefined when the report is simply
  // being assigned again to the same person, who should not be told they lost it.
  const previousStaffId =
    report.assigned_staff?.id === staff.id ? undefined : report.assigned_staff?.id;

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

  return updated as unknown as Report;
}

export async function addRemark({ report, user, details }: { report: Report; user: AuthUser; details: string }) {
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

// A new report has nobody assigned to it, so the only people who can act on it are
// the administrators who do the assigning. Without this nothing announces that work
// has arrived, and a report sits in `pending` until someone thinks to look.
//
// Failure is logged and swallowed rather than thrown: the citizen's report is
// already saved, and a notification that did not send is no reason to tell them
// their submission failed.
export async function notifyNewReport(report: Report) {
  const { data: admins, error: lookupFailed } = await db
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .eq("is_active", true);

  if (lookupFailed) {
    console.error("Could not look up admins to notify:", lookupFailed.message);
    return;
  }
  if (!admins?.length) return;

  const { error } = await db.from("notifications").insert(
    admins.map((admin) => ({
      user_id: admin.id,
      report_id: report.id,
      message: `${reportLabel(report)} was filed and is waiting to be assigned.`,
    })),
  );

  if (error) console.error("Could not notify admins of a new report:", error.message);
}

export { REPORT_FIELDS };
