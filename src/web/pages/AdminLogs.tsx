import { useMemo, useState } from "react";
import {
  ColumnMenu,
  DataTable,
  ExportMenu,
  NumberedPagination,
  TableToolbar,
  ToolbarItem,
  useColumnVisibility,
} from "../components/data-table/index.js";
import { Alert, EmptyState, Field, Input, Loading, Select, formatDateTime } from "../components/ui.js";
import { api } from "../lib/api.js";
import { capNotice, describeFilters, exportTable } from "../lib/export.js";
import type { Column, ExportFormat, ExportResult } from "../lib/table-types.js";
import { useApi } from "../lib/useApi.js";
import { ROLES, ROLE_LABEL, type ActivityLog, type Paged, type Role } from "../lib/types.js";

const PER_PAGE = 50;
const TABLE_ID = "admin-logs";

function actorText(log: ActivityLog) {
  return log.actor ? `${log.actor.name} (${ROLE_LABEL[log.actor.role] ?? log.actor.role})` : "";
}

function entityText(log: ActivityLog) {
  return [log.entity_type, log.entity_id].filter(Boolean).join(" ");
}

function detailsText(log: ActivityLog) {
  return log.metadata && Object.keys(log.metadata).length > 0 ? JSON.stringify(log.metadata) : "";
}

// GET /api/admin/logs takes no filters yet, so these run in the browser: on the
// loaded page for the table, and on the full export for the file. The same
// function serves both, so a file never holds rows the screen would have hidden.
function matches(log: ActivityLog, term: string, role: string) {
  if (role && (log.actor?.role ?? "") !== role) return false;
  if (!term) return true;
  const haystack = [log.action, log.actor?.name, log.entity_type, log.entity_id].join(" ").toLowerCase();
  return haystack.includes(term.toLowerCase());
}

const COLUMNS: Column<ActivityLog>[] = [
  {
    id: "when",
    header: "When",
    required: true,
    className: "font-mono text-[11px] whitespace-nowrap tabular-nums",
    cell: (log) => formatDateTime(log.created_at),
    exportValue: (log) => formatDateTime(log.created_at),
  },
  {
    id: "who",
    header: "Who",
    className: "text-[13px]",
    cell: (log) =>
      log.actor ? (
        <>
          {log.actor.name}
          <span className="text-muted font-mono text-[10px]"> ({ROLE_LABEL[log.actor.role] ?? log.actor.role})</span>
        </>
      ) : (
        "—"
      ),
    exportValue: actorText,
  },
  {
    id: "action",
    header: "Action",
    required: true,
    className: "font-mono text-[11px]",
    cell: (log) => <span translate="no">{log.action}</span>,
    exportValue: (log) => log.action,
  },
  {
    id: "entity",
    header: "Entity",
    className: "font-mono text-[11px]",
    cell: (log) => (
      <>
        {log.entity_type ?? "—"}
        {log.entity_id ? <span className="text-muted"> {String(log.entity_id).slice(0, 8)}</span> : null}
      </>
    ),
    exportValue: entityText,
  },
  {
    id: "details",
    header: "Details",
    className: "font-mono text-[10px] text-muted max-w-xs",
    cell: (log) => {
      const text = detailsText(log);
      return text ? (
        <span className="block truncate" title={text}>
          {text}
        </span>
      ) : (
        "—"
      );
    },
    exportValue: detailsText,
  },
];

// Wireframe 1s: the system-wide view. Report-scoped history stays on the report
// itself; this is who did what across the whole system.
export function AdminLogsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const query = useMemo(() => ({ page, per_page: PER_PAGE }), [page]);

  const { data, error, loading } = useApi<Paged<"logs", ActivityLog>>("/admin/logs", query);
  const { visible, setShown, reset } = useColumnVisibility(TABLE_ID, COLUMNS);

  const term = search.trim();
  const filtered = term !== "" || role !== "";
  const allLogs = data?.logs ?? [];
  const logs = filtered ? allLogs.filter((log) => matches(log, term, role)) : allLogs;

  async function onExport(format: ExportFormat) {
    const result = await api.get<ExportResult<"logs", ActivityLog>>("/exports/logs", { format });
    const rows = result.logs.filter((log) => matches(log, term, role));
    const notice = capNotice(result.total, result.limit, result.capped);

    await exportTable({
      format,
      name: "activity-log",
      title: "Activity log",
      columns: COLUMNS,
      visible,
      rows,
      filters: describeFilters([
        ["Search", term ? `“${term}”` : null],
        ["Role", role ? ROLE_LABEL[role as Role] : null],
      ]),
      capNotice: notice,
    });

    const done = `Exported ${rows.length.toLocaleString("en-PH")} log ${rows.length === 1 ? "entry" : "entries"} to ${format.toUpperCase()}.`;
    return notice ? `${done} ${notice}` : done;
  }

  return (
    <div className="flex flex-col gap-6">
      <TableToolbar title="Activity log" description="Every recorded action, newest first.">
        <ToolbarItem wide>
          <Field label="Search this page" htmlFor="log-q">
            <Input
              id="log-q"
              name="q"
              type="search"
              maxLength={100}
              autoComplete="off"
              placeholder="Action, name or entity…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Field>
        </ToolbarItem>

        <ToolbarItem>
          <Field label="Role" htmlFor="log-role">
            <Select id="log-role" value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="">Any role</option>
              {ROLES.map((key) => (
                <option key={key} value={key}>
                  {ROLE_LABEL[key]}
                </option>
              ))}
            </Select>
          </Field>
        </ToolbarItem>

        <ColumnMenu columns={COLUMNS} visible={visible} onToggle={setShown} onReset={reset} />
        <ExportMenu onExport={onExport} disabled={!data || data.total === 0} />
      </TableToolbar>

      {error && <Alert title="Could not load the activity log">{error.message}</Alert>}
      {loading && <Loading label="Loading the activity log" />}

      {/* Until the log route filters on the server, the filters can only narrow the
          page already loaded. Said plainly, so a short list is not read as the
          whole log. */}
      {filtered && allLogs.length > 0 && (
        <p role="status" className="m-0 text-muted text-[12px]">
          Showing {logs.length} of the {allLogs.length} entries on this page. Export applies the same filters to the
          whole log.
        </p>
      )}

      {!loading && allLogs.length === 0 && (
        <EmptyState title="Nothing has been recorded yet">
          Actions appear here as staff and administrators work on reports.
        </EmptyState>
      )}

      {!loading && allLogs.length > 0 && logs.length === 0 && (
        <EmptyState title="Nothing on this page matches those filters">
          Try another page, a different word, or clear the role filter.
        </EmptyState>
      )}

      {logs.length > 0 && (
        <DataTable
          id={TABLE_ID}
          columns={COLUMNS}
          visible={visible}
          rows={logs}
          rowKey={(log) => log.id}
          caption={`Activity log, newest first, ${data?.total ?? 0} entries in total.`}
        />
      )}

      {data && (
        <NumberedPagination
          page={data.page}
          perPage={data.per_page}
          total={data.total}
          onPage={setPage}
          label="Activity log pages"
        />
      )}
    </div>
  );
}
