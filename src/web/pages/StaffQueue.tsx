import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Card,
  EmptyState,
  Field,
  Input,
  Loading,
  Pagination,
  Select,
  StatusBadge,
  formatDate,
} from "../components/ui.js";
import { useApi } from "../lib/useApi.js";
import { STATUSES, STATUS_LABEL } from "../lib/types.js";
import type { Paged, Report } from "../lib/types.js";

const PER_PAGE = 20;

// Wireframes 1l and 1n. GET /api/reports is the same route citizens and admins
// call; the server scopes it to assigned_staff_id, so this asks for no id of its own.
export function StaffQueuePage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const query = useMemo(
    () => ({ q: search.trim(), status, sort: "oldest", page, per_page: PER_PAGE }),
    [search, status, page],
  );

  // Oldest first by default: the queue is work to get through, not a news feed.
  const { data, error, loading } = useApi<Paged<"reports", Report>>("/reports", query);
  const reports = data?.reports ?? [];
  const filtered = search.trim() !== "" || status !== "";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2>My queue</h2>
        <p className="text-muted text-[13px]">
          Reports assigned to you, oldest first. Open any report to inspect evidence, leave remarks, or advance its status.
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Search" htmlFor="q">
          <Input
            id="q"
            type="search"
            maxLength={100}
            placeholder="Search your queue"
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
      </div>

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

      {/* A queue is a worklist, so it reads as one: oldest at the top, one row each,
          and the row's action allows opening and inspecting the report. */}
      {reports.length > 0 && (
        <>
          {/* Mobile task cards on viewports under 768px (<md) */}
          <div className="flex flex-col gap-3 md:hidden">
            {reports.map((report) => (
              <Card key={report.id} className="p-4 flex flex-col gap-2.5 border border-divider">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-muted">{report.reference_code}</span>
                  <StatusBadge status={report.status} />
                </div>

                <div className="flex flex-col gap-1">
                  <Link
                    to={`/staff/reports/${report.id}`}
                    className="card-title text-[15px] font-semibold text-text hover:text-accent"
                  >
                    {report.title}
                  </Link>
                  <div className="flex items-center gap-2 flex-wrap text-muted text-[11px]">
                    <span className="tag tag-outline text-[10px] uppercase">
                      {report.category?.name ?? "Uncategorised"}
                    </span>
                    <span>&middot;</span>
                    <span>Filed {formatDate(report.submitted_at)}</span>
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
          <div className="hidden md:block overflow-x-auto">
            <table className="table w-full">
              <caption className="sr-only">
                Reports assigned to you, oldest first, {data?.total ?? 0} in total.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Reference</th>
                  <th scope="col">Title</th>
                  <th scope="col">Category</th>
                  <th scope="col">Status</th>
                  <th scope="col">Filed</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id}>
                    <td className="font-mono text-[11px] whitespace-nowrap">{report.reference_code}</td>
                    <td className="max-w-[32ch] min-w-[16ch]">
                      <Link to={`/staff/reports/${report.id}`} className="block truncate" title={report.title}>
                        {report.title}
                      </Link>
                    </td>
                    <td className="text-[13px] whitespace-nowrap">{report.category?.name ?? "Uncategorised"}</td>
                    <td>
                      <StatusBadge status={report.status} />
                    </td>
                    <td className="font-mono text-[11px] whitespace-nowrap">{formatDate(report.submitted_at)}</td>
                    <td>
                      <Link to={`/staff/reports/${report.id}`} className="btn btn-primary whitespace-nowrap">
                        Inspect report
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {data && <Pagination page={data.page} perPage={data.per_page} total={data.total} onPage={setPage} />}
    </div>
  );
}
