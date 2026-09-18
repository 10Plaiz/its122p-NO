import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
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
import { NEXT_STATUS_LABEL, STATUSES, STATUS_LABEL } from "../lib/types.js";
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
          Reports assigned to you, oldest first. Each one shows the single next step it can take.
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Search" htmlFor="q">
          <Input
            id="q"
            type="search"
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
          and the row's action is the single legal next step rather than a menu. */}
      {reports.length > 0 && (
        <div className="overflow-x-auto">
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
                  <span className="sr-only">Next step</span>
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
                      {NEXT_STATUS_LABEL[report.status] ?? "Open"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && <Pagination page={data.page} perPage={data.per_page} total={data.total} onPage={setPage} />}
    </div>
  );
}
