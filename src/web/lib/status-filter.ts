import { STATUSES, STATUS_LABEL, closurePendingOf } from "./types.js";
import type { ReportStatus } from "./types.js";

// #82: the Status filter's choices. "Awaiting verification" is not a stored status:
// it is a report under review or in progress whose closure request an
// Administrator has not decided. Mirrors STATUS_FILTERS in
// src/server/services/reports.workflow.ts, which applies it to the list and export.
export const STATUS_FILTERS = [...STATUSES, "awaiting_verification"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  ...STATUS_LABEL,
  awaiting_verification: "Awaiting verification",
};

// What a report counts under in the Status filter. A waiting report keeps its
// status, so it counts under both. Public board rows carry no closure fields.
export function statusFilterValues(report: {
  status: ReportStatus;
  closure_requested_at?: string | null;
  verified_at?: string | null;
}): StatusFilter[] {
  const waiting =
    (report.status === "under_review" || report.status === "in_progress") &&
    closurePendingOf({ closure_requested_at: report.closure_requested_at ?? null, verified_at: report.verified_at ?? null });
  return waiting ? [report.status, "awaiting_verification"] : [report.status];
}
