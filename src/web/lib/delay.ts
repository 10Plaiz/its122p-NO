import { DELAY_THRESHOLD_DAYS, VERIFICATION_DELAY_DAYS, closurePendingOf } from "./types.js";
import type { Report } from "./types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// How long a report has sat at its current stage, and whether that is past the
// stage's threshold (SW-6). Mirrors delayState in
// src/server/services/reports.workflow.ts, which the staff page shows; tables use
// this copy so each row needs no request of its own. tests/fast/report-columns.test.ts
// checks that the two agree.
export function delayOf(
  report: Pick<Report, "status" | "status_changed_at" | "submitted_at" | "closure_requested_at" | "verified_at">,
  now: Date = new Date(),
) {
  const waitingOnAdmin = closurePendingOf(report);
  const since = waitingOnAdmin ? (report.closure_requested_at as string) : (report.status_changed_at ?? report.submitted_at);
  const threshold = waitingOnAdmin ? VERIFICATION_DELAY_DAYS : DELAY_THRESHOLD_DAYS[report.status];

  const elapsed = Math.max(0, now.getTime() - new Date(since).getTime());
  return {
    days: Math.floor(elapsed / DAY_MS),
    delayed: threshold !== undefined && elapsed > threshold * DAY_MS,
  };
}
