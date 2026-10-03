import { db } from "../config/supabase.js";
import { badRequest, notFound, throwIfFailed } from "../lib/errors.js";
import { photoUrl } from "../lib/photos.js";

export type ReportStatus = "pending" | "under_review" | "in_progress" | "resolved" | "cancelled" | "rejected";
export type Report = {
  id: string;
  reference_code: string;
  title: string;
  status: ReportStatus;
  is_public: boolean;
  citizen: { id: string };
  assigned_staff: { id: string } | null;
  primary_problem?: ProblemName | null;
  secondary_problem?: ProblemName | null;
  photos: { storage_path: string; purged_at?: string | null; [key: string]: unknown }[];
  [key: string]: unknown;
};
type ProblemName = { id: number; name: string };

// Every column the API returns for a report, with its related rows joined in.
// The workflow dates (SW-6) and closure state (SW-4) are here so lists and tables
// can show them without a second request; GET /:id/workflow adds the names of who
// requested and verified a closure, and the computed delay.
export const REPORT_FIELDS = `
  id, reference_code, title, description, status, latitude, longitude,
  address_text, is_public, submitted_at, updated_at, resolved_at,
  assigned_at, status_changed_at, closure_requested_at, closure_outcome,
  closure_reason, verified_at,
  category:categories ( id, name ),
  primary_problem:problem_types!reports_primary_problem_fkey ( id, name ),
  secondary_problem:problem_types!reports_secondary_problem_fkey ( id, name ),
  citizen:profiles!reports_citizen_id_fkey ( id, name, email, contact_number, phone_verified_at, residency_status ),
  assigned_staff:profiles!reports_assigned_staff_id_fkey ( id, name, email ),
  photos:report_photos ( id, kind, storage_path, created_at, purged_at )
`;

export async function findReport(reportId: string | string[]) {
  if (typeof reportId !== "string") throw badRequest("A single report ID is required.");
  const { data } = await db.from("reports").select(REPORT_FIELDS).eq("id", reportId).single();
  if (!data) throw notFound("That report does not exist.");
  return data as unknown as Report;
}

// Replaces stored object keys with URLs the frontend can put in an <img src>. A
// photo whose file was removed after the retention period (DM-2) gets a null URL,
// so the page can say so instead of showing a broken image.
export function present(report: Report) {
  return {
    ...report,
    photos: (report.photos ?? []).map((photo) => ({ ...photo, url: photoUrl(photo.storage_path, photo.purged_at) })),
  };
}

// The report's problem ids, read from the joined problem rows.
export function problemIdsOf(report: Pick<Report, "primary_problem" | "secondary_problem">) {
  return {
    primary_problem_id: report.primary_problem?.id ?? null,
    secondary_problem_id: report.secondary_problem?.id ?? null,
  };
}

// Staff work many reports at once, so their notifications name the job rather than
// only its code. The text is stored as it was sent: a title edited later does not
// rewrite a notification already delivered.
export function reportLabel(report: Report) {
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
export async function recordUpdate({ report, actorId, updateType, previousStatus, newStatus, details, notify }: UpdateInput) {
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
