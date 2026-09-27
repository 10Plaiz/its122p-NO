import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Loading,
  Pagination,
  Select,
  StatusBadge,
  Textarea,
  formatDate,
} from "../components/ui.js";
import { useToast } from "../components/Toast.js";
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
  const [cancellingReport, setCancellingReport] = useState<Report | null>(null);

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
            maxLength={100}
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

      {/* Reports view: responsive status cards on viewports under 768px,
          full table layout preserved on 768px and up. */}
      {reports.length > 0 && (
        <>
          {/* Desktop table on viewports 768px and up (>=md) */}
          <div className="hidden md:block overflow-x-auto">
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
                      {report.status === "pending" && (
                        <Button type="button" onClick={() => setCancellingReport(report)}>
                          Cancel report
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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
                    to={`/reports/${report.id}`}
                    className="card-title text-[15px] font-semibold text-text hover:text-accent break-words"
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

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-divider">
                  <Link to={`/reports/${report.id}`} className="btn btn-secondary text-[12px] py-1 px-3">
                    View details
                  </Link>
                  {report.status === "pending" && (
                    <Button
                      type="button"
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

      {data && <Pagination page={data.page} perPage={data.per_page} total={data.total} onPage={setPage} />}
    </div>
  );
}

// Dedicated confirmation dialog when withdrawing a pending report.
function CancelDialog({
  report,
  onClose,
  onDone,
}: {
  report: Report;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [details, setDetails] = useState("");
  const { run, pending, error } = useAction((body?: { details?: string }) =>
    api.post<{ report: Report }>(`/reports/${report.id}/cancel`, body),
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, pending]);

  return (
    <div className="dialog-backdrop z-[1100]" role="presentation" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h4 id="cancel-dialog-title" className="dialog-title">
          Withdraw this report?
        </h4>

        <div className="dialog-body flex flex-col gap-3">
          <p className="text-[13px] text-muted">
            Are you sure you want to withdraw <strong>{report.title}</strong> ({report.reference_code})?
          </p>
          <p className="text-[12px] text-muted">
            The report will be marked as cancelled. Its history will be preserved, but municipal staff will no longer act on it.
          </p>

          <Field
            label="Reason"
            htmlFor="cancel-details"
            hint="Optional. Municipal staff will see this note in the report history."
            count={details.length}
            max={500}
          >
            <Textarea
              id="cancel-details"
              rows={3}
              maxLength={500}
              placeholder="e.g. Issue was already resolved or submitted by mistake"
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              disabled={pending}
            />
          </Field>

          {error && <Alert title="Could not cancel report">{error.message}</Alert>}
        </div>

        <div className="dialog-actions flex gap-3">
          <Button
            type="button"
            variant="primary"
            disabled={pending}
            onClick={async () => {
              const cancelled = await run({ details: details.trim() || undefined });
              if (cancelled) {
                toast("Report cancelled. Its history is kept.");
                onDone();
              }
            }}
          >
            {pending ? "Cancelling…" : "Yes, cancel"}
          </Button>
          <Button type="button" onClick={onClose} disabled={pending}>
            Keep it
          </Button>
        </div>
      </div>
    </div>
  );
}
