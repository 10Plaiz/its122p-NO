import { Link } from "react-router-dom";
import { api } from "../../lib/api.js";
import type { Query } from "../../lib/api.js";
import { capNotice, exportTable } from "../../lib/export.js";
import type { Column, ExportFormat, ExportResult } from "../../lib/table-types.js";
import { STATUS_LABEL } from "../../lib/types.js";
import type { Report } from "../../lib/types.js";
import { StatusBadge, formatDate } from "../ui.js";

// The report columns the three report tables share (all reports, the staff queue,
// my reports). Each screen picks the ones it needs, in its own order, and adds its
// own actions column. A new report field becomes a column here once, with its
// export text beside its cell, and every table can offer it.

const DATE_CELL = "font-mono text-[11px] whitespace-nowrap tabular-nums";

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
    cell: (report) => <StatusBadge status={report.status} />,
    exportValue: (report) => STATUS_LABEL[report.status],
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

  // TB-2: the date the report was resolved. Empty until then, which is itself the
  // answer to "is it done yet".
  completed: {
    id: "completed",
    header: "Completed",
    className: DATE_CELL,
    cell: (report) => formatDate(report.resolved_at),
    exportValue: (report) => (report.resolved_at ? formatDate(report.resolved_at) : ""),
  },
} satisfies Record<string, Column<Report> | ((detailPath: (report: Report) => string) => Column<Report>)>;

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
