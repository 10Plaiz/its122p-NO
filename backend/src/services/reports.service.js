import { db } from "../config/supabase.js";
import { badRequest, forbidden, notFound, orThrow } from "../lib/errors.js";

// The status flow from the proposal. A report moves forward one step at a time.
const NEXT_STATUS = {
  pending: ["under_review"],
  under_review: ["in_progress"],
  in_progress: ["resolved"],
  resolved: [],
};

export const STATUSES = Object.keys(NEXT_STATUS);

// Every column the API returns for a report, with its related rows joined in.
const REPORT_FIELDS = `
  id, reference_code, title, description, status, latitude, longitude,
  address_text, is_public, submitted_at, updated_at, resolved_at,
  category:categories ( id, name ),
  citizen:profiles!reports_citizen_id_fkey ( id, name, email, contact_number ),
  assigned_staff:profiles!reports_assigned_staff_id_fkey ( id, name, email ),
  photos:report_photos ( id, kind, storage_path, created_at )
`;

export async function findReport(reportId) {
  const { data } = await db.from("reports").select(REPORT_FIELDS).eq("id", reportId).single();
  if (!data) throw notFound("That report does not exist.");
  return data;
}

// Citizens may only see their own reports; staff and admins may see any.
export function assertCanView(report, user) {
  if (user.role === "admin" || user.role === "staff") return;
  if (report.citizen.id !== user.id) throw forbidden("You can only view your own reports.");
}

// Admins may act on any report; staff only on the ones assigned to them.
export function assertCanUpdate(report, user) {
  if (user.role === "admin") return;
  if (user.role === "staff" && report.assigned_staff?.id === user.id) return;
  throw forbidden("You can only update reports assigned to you.");
}

// Records a history entry and notifies the citizen who filed the report.
// Written as separate statements for readability; if partial writes ever become
// a problem, move these three into a single Postgres function and call it here.
async function recordUpdate({ report, actorId, updateType, previousStatus, newStatus, details, message }) {
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

export async function changeStatus({ report, user, newStatus, details }) {
  if (report.status === newStatus) {
    throw badRequest(`This report is already marked "${newStatus}".`);
  }
  if (!NEXT_STATUS[report.status].includes(newStatus)) {
    const allowed = NEXT_STATUS[report.status];
    throw badRequest(
      allowed.length === 0
        ? "A resolved report cannot change status."
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

  return updated;
}

export async function assignStaff({ report, user, staffId }) {
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

  return updated;
}

export async function addRemark({ report, user, details }) {
  await recordUpdate({
    report,
    actorId: user.id,
    updateType: "remark",
    details,
    message: `There is a new update on report ${report.reference_code}.`,
  });
}

export { REPORT_FIELDS };
