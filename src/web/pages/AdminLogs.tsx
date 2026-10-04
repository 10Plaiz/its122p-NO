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
import { Alert, Button, EmptyState, Field, Input, Loading, Select, formatDateTime } from "../components/ui.js";
import { api } from "../lib/api.js";
import { capNotice, describeFilters, exportTable } from "../lib/export.js";
import type { Column, ExportFormat, ExportResult } from "../lib/table-types.js";
import { ACTIVITY_LABEL, activityLabel } from "../lib/activity-labels.js";
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

// B9: actions listed by their readable label, for the Action filter.
const ACTION_OPTIONS = Object.entries(ACTIVITY_LABEL).sort((a, b) => a[1].localeCompare(b[1]));

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
    className: "text-[13px]",
    // B9: the readable label; the code stays in the tooltip for anyone tracing it.
    cell: (log) => <span title={log.action}>{activityLabel(log.action)}</span>,
    exportValue: (log) => activityLabel(log.action),
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
  const [action, setAction] = useState("");
  const [role, setRole] = useState("");
  const [reference, setReference] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // B9: filtered on the server, so every page and the export see the same rows.
  // Paging stays out of the filters so the export can reuse them unchanged.
  const filters = useMemo(
    () => ({ action, role, reference: reference.trim(), from, to }),
    [action, role, reference, from, to],
  );
  const query = useMemo(() => ({ ...filters, page, per_page: PER_PAGE }), [filters, page]);
  const filtered = Object.values(filters).some((value) => value !== "");

  const { data, error, loading } = useApi<Paged<"logs", ActivityLog>>("/admin/logs", query);
  const { visible, setShown, reset } = useColumnVisibility(TABLE_ID, COLUMNS);
  const logs = data?.logs ?? [];

  function clearFilters() {
    setAction("");
    setRole("");
    setReference("");
    setFrom("");
    setTo("");
    setPage(1);
  }

  // Any filter change starts again from the first page.
  function change(set: (value: string) => void) {
    return (value: string) => {
      set(value);
      setPage(1);
    };
  }

  async function onExport(format: ExportFormat) {
    const result = await api.get<ExportResult<"logs", ActivityLog>>("/exports/logs", { ...filters, format });
    const rows = result.logs;
    const notice = capNotice(result.total, result.limit, result.capped);

    await exportTable({
      format,
      name: "activity-log",
      title: "Activity log",
      columns: COLUMNS,
      visible,
      rows,
      filters: describeFilters([
        ["Action", action ? activityLabel(action) : null],
        ["Role", role ? ROLE_LABEL[role as Role] : null],
        ["Report", filters.reference ? `“${filters.reference}”` : null],
        ["From", from || null],
        ["To", to || null],
      ]),
      capNotice: notice,
    });

    const done = `Exported ${rows.length.toLocaleString("en-PH")} log ${rows.length === 1 ? "entry" : "entries"} to ${format.toUpperCase()}.`;
    return notice ? `${done} ${notice}` : done;
  }

  return (
    <div className="flex flex-col gap-6">
      <TableToolbar title="Activity log" description="Every recorded action, newest first."
        search={
          <Field label="Report" htmlFor="log-reference">
            <Input
              id="log-reference"
              name="reference"
              type="search"
              maxLength={20}
              autoComplete="off"
              spellCheck={false}
              placeholder="KMT-2026-0001…"
              value={reference}
              onChange={(event) => change(setReference)(event.target.value)}
            />
          </Field>
        }
      >
        <ToolbarItem wide>
          <Field label="Action" htmlFor="log-action">
            <Select id="log-action" value={action} onChange={(event) => change(setAction)(event.target.value)}>
              <option value="">Any action</option>
              {ACTION_OPTIONS.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </ToolbarItem>

        <ToolbarItem>
          <Field label="From" htmlFor="log-from">
            <Input id="log-from" type="date" value={from} max={to || undefined} onChange={(event) => change(setFrom)(event.target.value)} />
          </Field>
        </ToolbarItem>

        <ToolbarItem>
          <Field label="To" htmlFor="log-to">
            <Input id="log-to" type="date" value={to} min={from || undefined} onChange={(event) => change(setTo)(event.target.value)} />
          </Field>
        </ToolbarItem>

        <ToolbarItem>
          <Field label="Role" htmlFor="log-role">
            <Select id="log-role" value={role} onChange={(event) => change(setRole)(event.target.value)}>
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

      {!loading && logs.length === 0 && !filtered && (
        <EmptyState title="Nothing has been recorded yet">
          Actions appear here as staff and administrators work on reports.
        </EmptyState>
      )}

      {!loading && logs.length === 0 && filtered && (
        <EmptyState title="No entries match those filters">
          <p className="!m-0">Widen the dates, choose another action, or clear the report reference.</p>
          <Button type="button" className="mt-3" onClick={clearFilters}>
            Clear filters
          </Button>
        </EmptyState>
      )}

      {logs.length > 0 && (
        <DataTable
          id={TABLE_ID}
          columns={COLUMNS}
          visible={visible}
          rows={logs}
          rowKey={(log) => log.id}
          caption={`Activity log, newest first, ${data?.total ?? 0} ${filtered ? "matching entries" : "entries in total"}.`}
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
