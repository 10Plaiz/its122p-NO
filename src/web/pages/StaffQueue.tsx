import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ColumnMenu,
  DataTable,
  ExportMenu,
  NumberedPagination,
  TableToolbar,
  ToolbarItem,
  exportReports,
  reportColumn,
  useColumnVisibility,
} from "../components/data-table/index.js";
import { Alert, Card, EmptyState, Field, Input, Loading, Select, StatusBadge, formatDate } from "../components/ui.js";
import { RatingAverage } from "../components/FeedbackSummary.js";
import { BarangayFilter } from "../components/BarangayFilter.js";
import { describeFilters } from "../lib/export.js";
import type { Column } from "../lib/table-types.js";
import { useApi } from "../lib/useApi.js";
import { STATUSES, STATUS_LABEL, closurePendingOf } from "../lib/types.js";
import type { Paged, Report, ReportStatus } from "../lib/types.js";

const PER_PAGE = 20;
const TABLE_ID = "staff-queue";

// Wireframes 1l and 1n. GET /api/reports is the same route citizens and admins
// call; the server scopes it to assigned_staff_id, so this asks for no id of its own.
export function StaffQueuePage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [barangay, setBarangay] = useState("");
  const [page, setPage] = useState(1);

  // Oldest first by default: the queue is work to get through, not a news feed.
  const filters = useMemo(() => ({ q: search.trim(), status, barangay, sort: "oldest" }), [search, status, barangay]);
  const query = useMemo(() => ({ ...filters, page, per_page: PER_PAGE }), [filters, page]);

  const { data, error, loading } = useApi<Paged<"reports", Report>>("/reports", query);
  const reports = data?.reports ?? [];
  const filtered = search.trim() !== "" || status !== "";

  // A queue is a worklist, so it reads as one: oldest at the top, one row each,
  // and the row's action allows opening and inspecting the report.
  const columns = useMemo<Column<Report>[]>(
    () => [
      reportColumn.reference,
      reportColumn.title((report) => `/staff/reports/${report.id}`),
      reportColumn.category,
      reportColumn.status,
      reportColumn.barangay,
      reportColumn.location,
      reportColumn.filed,
      reportColumn.completed,
      {
        id: "actions",
        header: "Actions",
        srOnlyHeader: true,
        required: true,
        cell: (report) => (
          <Link to={`/staff/reports/${report.id}`} className="btn btn-primary whitespace-nowrap">
            Inspect report
          </Link>
        ),
      },
    ],
    [],
  );
  const { visible, setShown, reset } = useColumnVisibility(TABLE_ID, columns);

  function onExport(format: "csv" | "pdf") {
    return exportReports({
      format,
      query: filters,
      columns,
      visible,
      title: "My queue",
      name: "queue",
      filters: describeFilters([
        ["Search", filters.q ? `“${filters.q}”` : null],
        ["Status", status ? STATUS_LABEL[status as ReportStatus] : null],
        ["Barangay", barangay || null],
        ["Sort", "Oldest first"],
      ]),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <TableToolbar
        title="My queue"
        description="Reports assigned to you, oldest first. Open any report to inspect evidence, leave remarks, or advance its status."
        search={
          <Field label="Search" htmlFor="q">
            <Input
              id="q"
              name="q"
              type="search"
              maxLength={100}
              autoComplete="off"
              placeholder="Title or description…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </Field>
        }
      >
        <ToolbarItem>
          <Field label="Status" htmlFor="status">
            <Select
              id="status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Any status</option>
              {STATUSES.map((key) => (
                <option key={key} value={key}>
                  {STATUS_LABEL[key]}
                </option>
              ))}
            </Select>
          </Field>
        </ToolbarItem>

        <ToolbarItem>
          <BarangayFilter
            value={barangay}
            onChange={(value) => {
              setBarangay(value);
              setPage(1);
            }}
          />
        </ToolbarItem>

        {/* The column menu only changes the table, which phones do not show. */}
        <div className="hidden md:block">
          <ColumnMenu columns={columns} visible={visible} onToggle={setShown} onReset={reset} />
        </div>
        <ExportMenu onExport={onExport} disabled={!data || data.total === 0} />
      </TableToolbar>

      {error && <Alert title="Could not load your queue">{error.message}</Alert>}
      {loading && <Loading label="Loading your queue" />}

      {/* 1n: says why it is empty, not just that it is. */}
      {!loading && reports.length === 0 && (
        <EmptyState title={filtered ? "Nothing matches those filters" : "Nothing is assigned to you yet"}>
          {filtered
            ? "Try a different word, or clear the status filter."
            : "An administrator assigns reports to staff. When one comes to you, it will appear here and the citizen will be told it is under review."}
        </EmptyState>
      )}

      {reports.length > 0 && (
        <>
          {/* Mobile task cards on viewports under 768px (<md) */}
          <div className="flex flex-col gap-3 md:hidden">
            {reports.map((report) => (
              <Card key={report.id} className="p-4 flex flex-col gap-2.5 border border-divider">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-muted">{report.reference_code}</span>
                  <StatusBadge status={report.status} awaitingVerification={closurePendingOf(report)} />
                </div>

                <div className="flex flex-col gap-1">
                  <Link
                    to={`/staff/reports/${report.id}`}
                    className="card-title text-[15px] font-semibold text-text hover:text-accent"
                  >
                    {report.title}
                  </Link>
                  <div className="flex items-center gap-2 flex-wrap text-muted text-[11px]">
                    <span className="tag tag-neutral text-[10px] uppercase">
                      {report.category?.name ?? "Uncategorised"}
                    </span>
                    <span>&middot;</span>
                    <span>Filed {formatDate(report.submitted_at)}</span>
                    {report.resolved_at && (
                      <>
                        <span>&middot;</span>
                        <span>Completed {formatDate(report.resolved_at)}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="text-[12px] text-muted pt-1 border-t border-divider">
                  <span className="font-semibold text-text">Assignment:</span>{" "}
                  {report.assigned_staff?.name ? `Assigned to ${report.assigned_staff.name}` : "Assigned to you"}
                </div>

                <Link
                  to={`/staff/reports/${report.id}`}
                  className="btn btn-primary w-full justify-center text-center mt-1"
                >
                  Inspect report
                </Link>
              </Card>
            ))}
          </div>

          {/* Desktop table on viewports 768px and up (>=md) */}
          <DataTable
            id={TABLE_ID}
            className="hidden md:block"
            columns={columns}
            visible={visible}
            rows={reports}
            rowKey={(report) => report.id}
            caption={`Reports assigned to you, oldest first, ${data?.total ?? 0} in total.`}
          />
        </>
      )}

      {data && (
        <NumberedPagination
          page={data.page}
          perPage={data.per_page}
          total={data.total}
          onPage={setPage}
          label="Queue pages"
        />
      )}

      {/* FB-1: the staff member's own average from the reporters' ratings. */}
      <section className="flex flex-col gap-2 border-t border-divider pt-4">
        <h6 className="!m-0">Your rating</h6>
        <RatingAverage />
      </section>
    </div>
  );
}
