import { useMemo, useState } from "react";
import { Alert, EmptyState, Loading, Pagination, formatDateTime } from "../components/ui.js";
import { useApi } from "../lib/useApi.js";
import type { ActivityLog, Paged } from "../lib/types.js";

const PER_PAGE = 50;

// Wireframe 1s: the system-wide view. Report-scoped history stays on the report
// itself; this is who did what across the whole system.
export function AdminLogsPage() {
  const [page, setPage] = useState(1);
  const query = useMemo(() => ({ page, per_page: PER_PAGE }), [page]);

  const { data, error, loading } = useApi<Paged<"logs", ActivityLog>>("/admin/logs", query);
  const logs = data?.logs ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2>Activity log</h2>
        <p className="text-muted text-[13px]">Every recorded action, newest first.</p>
      </header>

      {error && <Alert title="Could not load the activity log">{error.message}</Alert>}
      {loading && <Loading label="Loading the activity log" />}

      {!loading && logs.length === 0 && (
        <EmptyState title="Nothing has been recorded yet">
          Actions appear here as staff and administrators work on reports.
        </EmptyState>
      )}

      {logs.length > 0 && (
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="font-mono text-[11px] whitespace-nowrap">
                    {formatDateTime(log.created_at)}
                  </td>
                  <td className="text-[13px]">
                    {log.actor ? (
                      <>
                        {log.actor.name}
                        <span className="text-muted font-mono text-[10px]"> ({log.actor.role})</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="font-mono text-[11px]">{log.action}</td>
                  <td className="font-mono text-[11px]">
                    {log.entity_type}
                    {log.entity_id ? (
                      <span className="text-muted"> {String(log.entity_id).slice(0, 8)}</span>
                    ) : null}
                  </td>
                  <td className="font-mono text-[10px] text-muted max-w-xs truncate">
                    {log.metadata ? JSON.stringify(log.metadata) : "—"}
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
