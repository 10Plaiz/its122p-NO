import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CancelDialog } from "../components/CancelDialog.js";
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
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Loading,
  Select,
  StatusBadge,
  formatDate,
} from "../components/ui.js";
import { describeFilters } from "../lib/export.js";
import type { Column } from "../lib/table-types.js";
import { useApi } from "../lib/useApi.js";
import { STATUSES, STATUS_LABEL, closurePendingOf } from "../lib/types.js";
import type { Paged, Report, ReportStatus } from "../lib/types.js";

const PER_PAGE = 20;
const TABLE_ID = "my-reports";

// Wireframe 1h, with 1i as its empty state. The server scopes GET /api/reports to
// the caller, so this asks for no citizen id of its own.
export function MyReportsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [cancellingReport, setCancellingReport] = useState<Report | null>(null);

  const filters = useMemo(() => ({ q: search.trim(), status }), [search, status]);
  const query = useMemo(() => ({ ...filters, page, per_page: PER_PAGE }), [filters, page]);

  const { data, error, loading, reload } = useApi<Paged<"reports", Report>>("/reports", query);
  const reports = data?.reports ?? [];
  const filtered = search.trim() !== "" || status !== "";

  const columns = useMemo<Column<Report>[]>(
    () => [
      reportColumn.reference,
      reportColumn.title((report) => `/reports/${report.id}`),
      reportColumn.category,
      reportColumn.status,
      reportColumn.problems,
      reportColumn.barangay,
      reportColumn.location,
      reportColumn.filed,
      reportColumn.completed,
      reportColumn.rating,
      {
        id: "actions",
        header: "Actions",
        srOnlyHeader: true,
        required: true,
        cell: (report) =>
          report.status === "pending" && (
            <Button type="button" variant="danger-outline" onClick={() => setCancellingReport(report)}>
              Cancel report
            </Button>
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
      title: "My reports",
      name: "my-reports",
      filters: describeFilters([
        ["Search", filters.q ? `“${filters.q}”` : null],
        ["Status", status ? STATUS_LABEL[status as ReportStatus] : null],
      ]),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <TableToolbar
        title="My reports"
        description="Everything you have filed, and where it stands."
        action={
          <Link to="/report/new" className="btn btn-primary">
            Report an issue
          </Link>
        }
      >
        <ToolbarItem wide>
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
        </ToolbarItem>

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

        {/* The column menu only changes the table, which phones do not show. */}
        <div className="hidden md:block">
          <ColumnMenu columns={columns} visible={visible} onToggle={setShown} onReset={reset} />
        </div>
        <ExportMenu onExport={onExport} disabled={!data || data.total === 0} />
      </TableToolbar>

      {error && <Alert title="Could not load your reports">{error.message}</Alert>}
      {loading && <Loading label="Loading your reports" />}

      {!loading && reports.length === 0 && (
        <EmptyState title={filtered ? "Nothing matches those filters" : "You have not filed a report yet"}>
          {filtered ? (
            <div className="flex flex-col items-start gap-3">
              <p>Try a different word, or clear the status filter.</p>
              <Button
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatus("");
                  setPage(1);
                }}
              >
                Clear filters
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3">
              <p>
                When you report a pothole, a dead streetlight or a blocked drain, it will appear here
                and you can follow it through to repair.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link to="/report/new" className="btn btn-primary">
                  Report an issue
                </Link>
                <Link to="/board" className="btn btn-secondary">
                  See what others have reported
                </Link>
              </div>
            </div>
          )}
        </EmptyState>
      )}

      {/* Reports view: responsive status cards on viewports under 768px,
          full table layout preserved on 768px and up. */}
      {reports.length > 0 && (
        <>
          {/* Desktop table on viewports 768px and up (>=md) */}
          <DataTable
            id={TABLE_ID}
            className="hidden md:block"
            columns={columns}
            visible={visible}
            rows={reports}
            rowKey={(report) => report.id}
            caption={`Reports you have filed, ${data?.total ?? 0} in total.`}
          />

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
                    to={`/reports/${report.id}`}
                    className="card-title text-[15px] font-semibold text-text hover:text-accent break-words"
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

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-divider">
                  <Link to={`/reports/${report.id}`} className="btn btn-secondary text-[12px] py-1 px-3">
                    View details
                  </Link>
                  {report.status === "pending" && (
                    <Button
                      type="button"
                      variant="danger-outline"
                      className="text-[12px] py-1 px-3"
                      onClick={() => setCancellingReport(report)}
                    >
                      Cancel report
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {cancellingReport && (
        <CancelDialog
          report={cancellingReport}
          onClose={() => setCancellingReport(null)}
          onDone={() => {
            setCancellingReport(null);
            reload();
          }}
        />
      )}

      {data && (
        <NumberedPagination
          page={data.page}
          perPage={data.per_page}
          total={data.total}
          onPage={setPage}
          label="My reports pages"
        />
      )}
    </div>
  );
}
