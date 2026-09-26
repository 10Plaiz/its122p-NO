import { STATUSES, type ReportStatus } from "../services/reports.service.js";

export type AnalyticsReportRow = {
  status: string;
  submitted_at: string;
  resolved_at?: string | null;
  category?: { name: string } | { name: string }[] | null;
};

export interface AnalyticsSummary {
  total_reports: number;
  by_status: Record<ReportStatus, number>;
  by_category: Record<string, number>;
  resolved_count: number;
  average_resolution_days: number | null;
}

// Aggregates report metrics in JavaScript. At the volume this system handles,
// that is fast and keeps the calculation visible and testable in one place.
export function calculateAnalytics(reports: AnalyticsReportRow[]): AnalyticsSummary {
  const byStatus = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<ReportStatus, number>;
  const byCategory: Record<string, number> = {};
  const resolutionDays: number[] = [];

  for (const report of reports) {
    if (report.status in byStatus) byStatus[report.status as ReportStatus] += 1;
    const category = Array.isArray(report.category) ? report.category[0] : report.category;
    if (category?.name) byCategory[category.name] = (byCategory[category.name] ?? 0) + 1;

    if (report.resolved_at) {
      const elapsed = new Date(report.resolved_at).getTime() - new Date(report.submitted_at).getTime();
      resolutionDays.push(elapsed / 86_400_000);
    }
  }

  const average = resolutionDays.length
    ? resolutionDays.reduce((sum, days) => sum + days, 0) / resolutionDays.length
    : null;

  return {
    total_reports: reports.length,
    by_status: byStatus,
    by_category: byCategory,
    // Counted from `status`, the same field the by-status breakdown uses, so the
    // dashboard's "Resolved" tile and its "Resolved" bar can never disagree. Counting
    // timestamps instead made them two independent numbers under one label: any row
    // resolved without a `resolved_at` (a migration, a manual fix, seeded data) showed
    // up in one and not the other, and quietly inflated the derived "Open" figure.
    // `resolutionDays` still drives the average, because only a row with both timestamps
    // can contribute to it.
    resolved_count: byStatus.resolved,
    average_resolution_days: average === null ? null : Number(average.toFixed(1)),
  };
}
