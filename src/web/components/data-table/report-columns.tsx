import { Link } from "react-router-dom";
import { api } from "../../lib/api.js";
import type { Query } from "../../lib/api.js";
import { capNotice, exportTable } from "../../lib/export.js";
import type { Column, ExportFormat, ExportResult } from "../../lib/table-types.js";
import { delayOf } from "../../lib/delay.js";
import { STATUS_LABEL, closurePendingOf } from "../../lib/types.js";
import type { Report } from "../../lib/types.js";
import { DelayBadge, StatusBadge, formatDate } from "../ui.js";

// The report columns the three report tables share (all reports, the staff queue,
// my reports). Each screen picks the ones it needs, in its own order, and adds its
// own actions column. A new report field becomes a column here once, with its
// export text beside its cell, and every table can offer it.

const DATE_CELL = "font-mono text-[11px] whitespace-nowrap tabular-nums";

// Table and export rows carry the reporter's rating (GET /api/reports and
// /api/exports/reports join it; see src/server/services/reports.rows.ts).
type ReportRow = Report & { feedback?: { rating: number } | null };
const ratingOf = (report: Report) => (report as ReportRow).feedback?.rating ?? null;

// The reporter's proof of residency (UA-8), as an administrator reads it.
const RESIDENCY_TEXT: Record<string, string> = {
  verified: "Verified",
  pending: "Proof not yet reviewed",
  rejected: "Proof rejected",
};
const residencyText = (report: Report) => {
  const status = report.citizen?.residency_status;
  return status ? (RESIDENCY_TEXT[status] ?? status) : "No proof";
};

const problemsText = (report: Report) =>
  [report.primary_problem?.name, report.secondary_problem?.name].filter(Boolean).join(", ");

// The status word, plus "awaiting verification" while an administrator has a
// request to decide (SW-4, SW-7) and "delayed" past the stage's threshold (SW-6).
function statusText(report: Report) {
  const parts = [closurePendingOf(report) ? "Awaiting verification" : STATUS_LABEL[report.status]];
  const delay = delayOf(report);
  if (delay.delayed) parts.push(`delayed ${delay.days} ${delay.days === 1 ? "day" : "days"}`);
  return parts.join(", ");
}

export const reportColumn = {
  reference: {
    id: "reference",
    header: "Reference",
    required: true,
    className: "font-mono text-[11px] whitespace-nowrap",
    cell: (report) => <span translate="no">{report.reference_code}</span>,
    exportValue: (report) => report.reference_code,
  },

  title: (detailPath: (report: Report) => string): Column<Report> => ({
    id: "title",
    header: "Title",
    required: true,
    className: "max-w-[32ch] min-w-[16ch]",
    cell: (report) => (
      <Link to={detailPath(report)} className="block truncate" title={report.title}>
        {report.title}
      </Link>
    ),
    exportValue: (report) => report.title,
  }),

  category: {
    id: "category",
    header: "Category",
    className: "text-[13px] whitespace-nowrap",
    cell: (report) => report.category?.name ?? "Uncategorised",
    exportValue: (report) => report.category?.name ?? "Uncategorised",
  },

  status: {
    id: "status",
    header: "Status",
    cell: (report) => (
      <span className="flex flex-wrap items-center gap-1">
        <StatusBadge status={report.status} awaitingVerification={closurePendingOf(report)} />
        <DelayBadge delay={delayOf(report)} />
      </span>
    ),
    exportValue: statusText,
  },

  // SW-1: the barangay the pin is in.
  barangay: {
    id: "barangay",
    header: "Barangay",
    defaultHidden: true,
    className: "text-[13px] whitespace-nowrap",
    cell: (report) => report.barangay ?? "—",
    exportValue: (report) => report.barangay ?? "",
  },

  // RS-4: the main problem first, then the other one.
  problems: {
    id: "problems",
    header: "Problems",
    defaultHidden: true,
    className: "text-[13px] max-w-[28ch]",
    cell: (report) => {
      const text = problemsText(report);
      return text ? <span className="block truncate" title={text}>{text}</span> : "—";
    },
    exportValue: problemsText,
  },

  // SW-6: when the current assignee got the report.
  assignedOn: {
    id: "assigned_at",
    header: "Assigned on",
    defaultHidden: true,
    className: DATE_CELL,
    cell: (report) => formatDate(report.assigned_at),
    exportValue: (report) => (report.assigned_at ? formatDate(report.assigned_at) : ""),
  },

  // SW-6: whole days at the current stage, the number the Delayed tag is judged on.
  daysInStage: {
    id: "days_in_stage",
    header: "Days in stage",
    defaultHidden: true,
    className: "font-mono text-[11px] tabular-nums text-right",
    cell: (report) => delayOf(report).days,
    exportValue: (report) => String(delayOf(report).days),
  },

  // UA-8 and UA-6: what the administrator knows about the reporter.
  residency: {
    id: "reporter_residency",
    header: "Reporter residency",
    defaultHidden: true,
    className: "text-[13px] whitespace-nowrap",
    cell: residencyText,
    exportValue: residencyText,
  },

  phoneVerified: {
    id: "reporter_phone",
    header: "Phone verified",
    defaultHidden: true,
    className: "text-[13px]",
    cell: (report) => (report.citizen?.phone_verified_at ? "Yes" : "No"),
    exportValue: (report) => (report.citizen?.phone_verified_at ? "Yes" : "No"),
  },

  // FB-1: the reporter's rating of a resolved report.
  rating: {
    id: "rating",
    header: "Rating",
    defaultHidden: true,
    className: "font-mono text-[11px] tabular-nums whitespace-nowrap",
    cell: (report) => {
      const rating = ratingOf(report);
      return rating === null ? "—" : `${rating} / 5`;
    },
    exportValue: (report) => {
      const rating = ratingOf(report);
      return rating === null ? "" : String(rating);
    },
  },

  citizen: {
    id: "citizen",
    header: "Filed by",
    defaultHidden: true,
    className: "text-[13px]",
    cell: (report) => report.citizen?.name ?? "—",
    exportValue: (report) => report.citizen?.name ?? "",
  },

  assigned: {
    id: "assigned",
    header: "Assigned to",
    className: "text-[13px]",
    cell: (report) => report.assigned_staff?.name ?? "—",
    exportValue: (report) => report.assigned_staff?.name ?? "",
  },

  location: {
    id: "location",
    header: "Location",
    defaultHidden: true,
    className: "text-[13px] max-w-[28ch]",
    cell: (report) => <span className="block truncate" title={report.address_text ?? undefined}>{report.address_text ?? "—"}</span>,
    exportValue: (report) => report.address_text ?? "",
  },

  filed: {
    id: "filed",
    header: "Filed",
    className: DATE_CELL,
    cell: (report) => formatDate(report.submitted_at),
    exportValue: (report) => formatDate(report.submitted_at),
  },

  // TB-2: the date the report was closed: resolved, or rejected once an
  // administrator approved it (SW-7). Empty until then, which is itself the answer
  // to "is it done yet". The id stays "completed" so saved column choices still apply.
  completed: {
    id: "completed",
    header: "Closed",
    className: DATE_CELL,
    cell: (report) => formatDate(closedAt(report)),
    exportValue: (report) => {
      const date = closedAt(report);
      return date ? formatDate(date) : "";
    },
  },
} satisfies Record<string, Column<Report> | ((detailPath: (report: Report) => string) => Column<Report>)>;

function closedAt(report: Report) {
  if (report.resolved_at) return report.resolved_at;
  return report.status === "rejected" ? report.verified_at : null;
}

const SORT_LABEL: Record<string, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  status: "By status",
};

export function sortLabel(sort: string) {
  return SORT_LABEL[sort] ?? sort;
}

type ReportExport = {
  format: ExportFormat;
  /** The same filters the table's GET /api/reports call uses, without paging. */
  query: Query;
  columns: Column<Report>[];
  visible: ReadonlySet<string>;
  /** PDF heading, e.g. "All reports". */
  title: string;
  /** Filename part: kamoti-<name>-YYYY-MM-DD. */
  name: string;
  /** From describeFilters(). */
  filters: string;
};

// Fetches every report the filters match (role-scoped on the server, capped at its
// limit) and downloads them. Resolves with the sentence the export menu confirms.
export async function exportReports({ format, query, columns, visible, title, name, filters }: ReportExport) {
  const result = await api.get<ExportResult<"reports", Report>>("/exports/reports", { ...query, format });
  const notice = capNotice(result.total, result.limit, result.capped);

  await exportTable({ format, name, title, columns, visible, rows: result.reports, filters, capNotice: notice });

  const count = result.reports.length;
  const done = `Exported ${count.toLocaleString("en-PH")} ${count === 1 ? "report" : "reports"} to ${format.toUpperCase()}.`;
  return notice ? `${done} ${notice}` : done;
}
