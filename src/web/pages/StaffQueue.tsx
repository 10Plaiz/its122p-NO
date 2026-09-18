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

      <div className="flex flex-col gap-3">
        {reports.map((report) => (
          <article key={report.id} className="card p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="font-mono text-[10px] text-muted">{report.reference_code}</span>
              <StatusBadge status={report.status} />
            </div>

            <h5>
              <Link to={`/staff/reports/${report.id}`}>{report.title}</Link>
            </h5>

            <p className="text-muted text-[13px] line-clamp-2">{report.description}</p>

            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
              <span className="text-muted font-mono text-[11px]">
                {report.category?.name ?? "Uncategorised"} &middot; filed {formatDate(report.submitted_at)}
              </span>

              {/* The row action is whatever the one legal next step is. */}
              <Link to={`/staff/reports/${report.id}`} className="btn btn-primary">
                {NEXT_STATUS_LABEL[report.status] ?? "Open"}
              </Link>
            </div>
          </article>
        ))}
      </div>

      {data && <Pagination page={data.page} perPage={data.per_page} total={data.total} onPage={setPage} />}
    </div>
  );
}
