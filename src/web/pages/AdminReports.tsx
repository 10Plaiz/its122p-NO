import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Input,
  Loading,
  Pagination,
  Select,
  StatusBadge,
  formatDate,
} from "../components/ui.js";
import { api } from "../lib/api.js";
import { useAction, useApi } from "../lib/useApi.js";
import { SORTS, STATUSES, STATUS_LABEL } from "../lib/types.js";
import type { Category, Paged, Profile, Report, Sort } from "../lib/types.js";

const PER_PAGE = 20;

// Wireframe 1p. An admin sees every report — GET /api/reports returns the unscoped
// set for this role — and assigning is admin-only, per PATCH /reports/:id/assign.
export function AdminReportsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [page, setPage] = useState(1);
  const [assigning, setAssigning] = useState<Report | null>(null);

  const query = useMemo(
    () => ({ q: search.trim(), status, category_id: categoryId, sort, page, per_page: PER_PAGE }),
    [search, status, categoryId, sort, page],
  );

  const { data, error, loading, reload } = useApi<Paged<"reports", Report>>("/reports", query);
  const { data: categoryData } = useApi<{ categories: Category[] }>("/categories");

  const reports = data?.reports ?? [];
  const filtered = search.trim() !== "" || status !== "" || categoryId !== "";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2>All reports</h2>
        <p className="text-muted text-[13px]">Every report in the system, and who is working on it.</p>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Search" htmlFor="q">
          <Input
            id="q"
            type="search"
            maxLength={100}
            placeholder="Search all reports"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </Field>

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
            {(categoryData?.categories ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>

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
                {key === "newest" ? "Newest first" : key === "oldest" ? "Oldest first" : "By status"}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {error && <Alert title="Could not load reports">{error.message}</Alert>}
      {loading && <Loading label="Loading reports" />}

      {!loading && reports.length === 0 && (
        <EmptyState title={filtered ? "Nothing matches those filters" : "No reports have been filed yet"}>
          {filtered ? "Try a different word, or clear the filters." : "Reports appear here as citizens file them."}
        </EmptyState>
      )}

      {reports.length > 0 && (
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Title</th>
                <th>Category</th>
                <th>Status</th>
                <th>Assigned to</th>
                <th>Filed</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id}>
                  <td className="font-mono text-[11px]">{report.reference_code}</td>
                  <td>
                    <Link to={`/staff/reports/${report.id}`}>{report.title}</Link>
                  </td>
                  <td className="text-[13px]">{report.category?.name ?? "—"}</td>
                  <td>
                    <StatusBadge status={report.status} />
                  </td>
                  <td className="text-[13px]">{report.assigned_staff?.name ?? "—"}</td>
                  <td className="font-mono text-[11px]">{formatDate(report.submitted_at)}</td>
                  <td>
                    <Button type="button" onClick={() => setAssigning(report)}>
                      Assign
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && <Pagination page={data.page} perPage={data.per_page} total={data.total} onPage={setPage} />}

      {assigning && (
        <AssignDialog
          report={assigning}
          onClose={() => setAssigning(null)}
          onDone={() => {
            setAssigning(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

// Wireframe 1p's dialog. Only active staff can be assigned; the server checks the
// role and is_active again in assignStaff().
function AssignDialog({
  report,
  onClose,
  onDone,
}: {
  report: Report;
  onClose: () => void;
  onDone: () => void;
}) {
  const [staffId, setStaffId] = useState(report.assigned_staff?.id ?? "");
  const [touched, setTouched] = useState(false);

  const { data, loading } = useApi<{ users: Profile[] }>("/admin/users", { role: "staff" });
  const { run, pending, error } = useAction((body: { staff_id: string }) =>
    api.patch<{ report: Report }>(`/reports/${report.id}/assign`, body),
  );

  const staff = (data?.users ?? []).filter((user) => user.is_active !== false);

  return (
    // ds.css already makes .dialog-backdrop a fixed, centred overlay. Only the
    // stacking order is added here: Leaflet's panes and controls reach z-index 1000,
    // so the dialog has to clear them.
    <div className="dialog-backdrop z-[1100]" role="presentation" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h4 id="assign-title" className="dialog-title">
          Assign this report
        </h4>

        <div className="dialog-body flex flex-col gap-3">
          <p className="text-[13px] text-muted">{report.title}</p>

          {loading && <Loading label="Loading staff" />}

          {!loading && staff.length === 0 && (
            <Alert title="No staff to assign">
              Create a staff account first, on the Users screen.
            </Alert>
          )}

          {staff.length > 0 && (
            <Field
              label="Staff member"
              htmlFor="staff"
              error={touched && !staffId ? "Choose who should take this." : undefined}
            >
              <Select id="staff" value={staffId} onChange={(event) => setStaffId(event.target.value)}>
                <option value="">Choose a staff member</option>
                {staff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {error && <Alert title="Could not assign">{error.message}</Alert>}
        </div>

        <div className="dialog-actions flex gap-3">
          <Button
            type="button"
            variant="primary"
            disabled={pending || staff.length === 0}
            onClick={async () => {
              setTouched(true);
              if (!staffId) return;
              const done = await run({ staff_id: staffId });
              if (done) onDone();
            }}
          >
            {pending ? "Assigning..." : "Assign"}
          </Button>
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
