import { db } from "../config/supabase.js";
import { ApiError, badRequest, forbidden, orThrow } from "../lib/errors.js";
import type { AuthUser } from "../types/auth.js";
import { reportLabel, type Report } from "./reports.common.js";

// FB-1: a citizen rates the repair of their own resolved report, once. The rating
// is routed to the staff member who was assigned at the time. Rows are never
// updated or deleted (see 20261003000500_feedback.sql).

export const FEEDBACK_FIELDS = "id, report_id, rating, comment, created_at";

export const ALREADY_RATED = "You have already rated this report.";

export type Feedback = {
  id: string;
  report_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

// Only the citizen who filed the report may rate it, and only once the work is
// done: a rating of a repair that has not happened yet means nothing.
export function assertCanRate(report: Report, user: AuthUser) {
  if (user.role !== "citizen" || report.citizen?.id !== user.id) {
    throw forbidden("You can only rate your own reports.");
  }
  if (report.status !== "resolved") {
    throw badRequest("You can rate this report once it is resolved.");
  }
}

// What the assigned staff member is told. Undefined when nobody was assigned,
// because there is nobody to tell.
export function feedbackNotice(report: Report, rating: number) {
  const staffId = report.assigned_staff?.id;
  if (!staffId) return undefined;
  return { userId: staffId, message: `${reportLabel(report)} was rated ${rating} out of 5 by the reporter.` };
}

export async function findFeedback(reportId: string) {
  const result = await db.from("report_feedback").select(FEEDBACK_FIELDS).eq("report_id", reportId).maybeSingle();
  if (result.error) throw new ApiError(500, "The rating could not be loaded.", result.error.message);
  return (result.data ?? null) as Feedback | null;
}

type CreateInput = { report: Report; user: AuthUser; rating: number; comment?: string };
export async function createFeedback({ report, user, rating, comment }: CreateInput) {
  assertCanRate(report, user);

  // Checked first for a clear answer; the unique index on report_id still decides
  // when two submissions race.
  if (await findFeedback(report.id)) throw new ApiError(409, ALREADY_RATED);

  const result = await db
    .from("report_feedback")
    .insert({
      report_id: report.id,
      citizen_id: user.id,
      staff_id: report.assigned_staff?.id ?? null,
      rating,
      comment: comment ?? null,
    })
    .select(FEEDBACK_FIELDS)
    .single();

  // 23505 is Postgres's unique violation: the other submission won the race.
  if (result.error?.code === "23505") throw new ApiError(409, ALREADY_RATED);
  const feedback = orThrow(result, "Your rating could not be saved.") as Feedback;

  // Logged and swallowed, as in notifyNewReport: the rating is already saved, and
  // an error here would make the citizen retry into "already rated".
  const notice = feedbackNotice(report, rating);
  if (notice) {
    const { error } = await db
      .from("notifications")
      .insert({ user_id: notice.userId, report_id: report.id, message: notice.message });
    if (error) console.error("Could not notify staff of a new rating:", error.message);
  }

  return feedback;
}

export type FeedbackSummary = { staff_id: string | null; average: number | null; count: number };

// Average rating and how many ratings it is drawn from. A null staff id covers
// every rating (the admin's overall view).
export async function summarizeFeedback(staffId: string | null): Promise<FeedbackSummary> {
  const rows = orThrow(
    await db.rpc("feedback_summary", { p_staff_id: staffId }),
    "The rating summary could not be loaded.",
  ) as { average: number | string | null; total: number | string }[];

  // numeric and bigint arrive as strings or numbers depending on size.
  const row = rows[0];
  const count = Number(row?.total ?? 0);
  return {
    staff_id: staffId,
    average: count > 0 && row?.average != null ? Number(row.average) : null,
    count,
  };
}
