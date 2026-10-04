import { useCallback, useMemo, useState } from "react";
import { AssignDialog } from "../components/AssignDialog.js";
import {
  ColumnMenu,
  DataTable,
  ExportMenu,
  NumberedPagination,
  TableToolbar,
  ToolbarItem,
  exportReports,
  reportColumn,
  sortLabel,
  useColumnVisibility,
} from "../components/data-table/index.js";
import { Alert, Button, EmptyState, Field, Input, Loading, Select } from "../components/ui.js";
import { BarangayFilter } from "../components/BarangayFilter.js";
import { describeFilters } from "../lib/export.js";
import type { Column } from "../lib/table-types.js";
import { useApi } from "../lib/useApi.js";
import { SORTS, STATUSES, STATUS_LABEL } from "../lib/types.js";
import type { Category, Paged, Report, ReportStatus, Sort } from "../lib/types.js";

const PER_PAGE = 20;
const TABLE_ID = "admin-reports";

// Wireframe 1p. An admin sees every report — GET /api/reports returns the unscoped
// set for this role — and assigning is admin-only, per PATCH /reports/:id/assign.
export function AdminReportsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [barangay, setBarangay] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [page, setPage] = useState(1);
  const [assigning, setAssigning] = useState<Report | null>(null);
  const closeAssign = useCallback(() => setAssigning(null), []);

  // Paging stays out of the filters so an export can reuse them unchanged.
  const filters = useMemo(
    () => ({ q: search.trim(), status, category_id: categoryId, barangay, sort }),
    [search, status, categoryId, barangay, sort],
  );
  const query = useMemo(() => ({ ...filters, page, per_page: PER_PAGE }), [filters, page]);

  const { data, error, loading, reload } = useApi<Paged<"reports", Report>>("/reports", query);
  const { data: categoryData } = useApi<{ categories: Category[] }>("/categories");
  const categories = categoryData?.categories ?? [];

  const columns = useMemo<Column<Report>[]>(
    () => [
      reportColumn.reference,
      reportColumn.title((report) => `/staff/reports/${report.id}`),
      reportColumn.category,
      reportColumn.status,
      reportColumn.problems,
      reportColumn.citizen,
      reportColumn.residency,
      reportColumn.phoneVerified,
      reportColumn.assigned,
      reportColumn.assignedOn,
      reportColumn.daysInStage,
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
        cell: (report) => (
          <Button type="button" onClick={() => setAssigning(report)}>
            Assign
          </Button>
        ),
      },
    ],
    [],
  );
  const { visible, setShown, reset } = useColumnVisibility(TABLE_ID, columns);

  const reports = data?.reports ?? [];
  const filtered = search.trim() !== "" || status !== "" || categoryId !== "";

  function onExport(format: "csv" | "pdf") {
    const categoryName = categories.find((category) => String(category.id) === categoryId)?.name;
    return exportReports({
      format,
      query: filters,
      columns,
      visible,
      title: "All reports",
      name: "reports",
      filters: describeFilters([
        ["Search", filters.q ? `“${filters.q}”` : null],
        ["Status", status ? STATUS_LABEL[status as ReportStatus] : null],
        ["Category", categoryName],
        ["Barangay", barangay || null],
        ["Sort", sortLabel(sort)],
      ]),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <TableToolbar title="All reports" description="Every report in the system, and who is working on it.">
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

        <ToolbarItem>
          <BarangayFilter
            value={barangay}
            onChange={(value) => {
              setBarangay(value);
              setPage(1);
            }}
          />
        </ToolbarItem>

        <ToolbarItem>
          <Field label="Category" htmlFor="category">
            <Select
              id="category"
              value={categoryId}
              onChange={(event) => {
                setCategoryId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Any category</option>
              {/* Retired categories stay in this filter on purpose, and are the one place
                  they appear: reports filed under a category before it was retired still
                  exist, and an admin auditing them needs a way to select it. Marked so the
                  list does not look like it is offering a category citizens can still pick.
                  The board's public filter and the report forms both drop them (see
                  Board.tsx and NewReport.tsx). */}
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.is_active ? category.name : `${category.name} (retired)`}
                </option>
              ))}
            </Select>
          </Field>
        </ToolbarItem>

        <ToolbarItem>
          <Field label="Sort" htmlFor="sort">
            <Select
              id="sort"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as Sort);
                setPage(1);
              }}
            >
              {SORTS.map((key) => (
                <option key={key} value={key}>
                  {sortLabel(key)}
                </option>
              ))}
            </Select>
          </Field>
        </ToolbarItem>

        <ColumnMenu columns={columns} visible={visible} onToggle={setShown} onReset={reset} />
        <ExportMenu onExport={onExport} disabled={!data || data.total === 0} />
      </TableToolbar>

      {error && <Alert title="Could not load reports">{error.message}</Alert>}
      {loading && <Loading label="Loading reports" />}

      {!loading && reports.length === 0 && (
        <EmptyState title={filtered ? "Nothing matches those filters" : "No reports have been filed yet"}>
          {filtered ? "Try a different word, or clear the filters." : "Reports appear here as citizens file them."}
        </EmptyState>
      )}

      {reports.length > 0 && (
        <DataTable
          id={TABLE_ID}
          columns={columns}
          visible={visible}
          rows={reports}
          rowKey={(report) => report.id}
          caption={`All reports, ${data?.total ?? 0} in total.`}
        />
      )}

      {data && (
        <NumberedPagination
          page={data.page}
          perPage={data.per_page}
          total={data.total}
          onPage={setPage}
          label="All reports pages"
        />
      )}

      {assigning && (
        <AssignDialog
          report={assigning}
          onClose={closeAssign}
          onDone={() => {
            setAssigning(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
