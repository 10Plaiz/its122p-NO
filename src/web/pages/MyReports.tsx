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
import { STATUSES, STATUS_LABEL } from "../lib/types.js";
import type { Paged, Report } from "../lib/types.js";

const PER_PAGE = 20;

// Wireframe 1h, with 1i as its empty state. The server scopes GET /api/reports to
// the caller, so this asks for no citizen id of its own.
export function MyReportsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const query = useMemo(
    () => ({ q: search.trim(), status, page, per_page: PER_PAGE }),
    [search, status, page],
  );

  const { data, error, loading, reload } = useApi<Paged<"reports", Report>>("/reports", query);
  const reports = data?.reports ?? [];
  const filtered = search.trim() !== "" || status !== "";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2>My reports</h2>
          <p className="text-muted text-[13px]">Everything you have filed, and where it stands.</p>
        </div>
        <Link to="/report/new" className="btn btn-primary">
          Report an issue
        </Link>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Search" htmlFor="q">
          <Input
            id="q"
            type="search"
            placeholder="Search your reports"
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

      {/* One row per report, scrolling sideways rather than reflowing: a citizen
          comparing their own reports is comparing the same field down a column. */}
      {reports.length > 0 && (
        <div className="overflow-x-auto">
          <table className="table w-full">
            <caption className="sr-only">
              Reports you have filed, {data?.total ?? 0} in total.
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
                    <Link to={`/reports/${report.id}`} className="block truncate" title={report.title}>
                      {report.title}
                    </Link>
                  </td>
                  <td className="text-[13px] whitespace-nowrap">{report.category?.name ?? "Uncategorised"}</td>
                  <td>
                    <StatusBadge status={report.status} />
                  </td>
                  <td className="font-mono text-[11px] whitespace-nowrap">{formatDate(report.submitted_at)}</td>
                  <td>
                    {/* Only a pending report is still the citizen's to change; once staff
                        pick it up they may already be acting on what it says. */}
                    {report.status === "pending" && (
                      <CancelButton reportId={report.id} onDone={reload} />
                    )}
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

// A cancelled report is kept, never deleted, so its history survives — but it is
// still a one-way door for the citizen, hence the inline confirm.
function CancelButton({ reportId, onDone }: { reportId: string; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const { run, pending, error } = useAction(() =>
    api.post<{ report: Report }>(`/reports/${reportId}/cancel`),
  );

  if (!confirming) {
    return (
      <Button type="button" onClick={() => setConfirming(true)}>
        Cancel report
      </Button>
    );
  }

  return (
    <span className="flex items-center gap-2 flex-wrap">
      <span className="text-[12px]">Withdraw this report?</span>

      <Button
        type="button"
        variant="primary"
        disabled={pending}
        onClick={async () => {
          const cancelled = await run();
          if (cancelled) onDone();
        }}
      >
        {pending ? "Cancelling…" : "Yes, cancel"}
      </Button>

      <Button type="button" onClick={() => setConfirming(false)}>
        Keep it
      </Button>

      {error && <span className="text-[11px] text-accent-700">{error.message}</span>}
    </span>
  );
}
