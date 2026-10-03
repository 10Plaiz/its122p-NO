import { Router } from "express";
import { z } from "zod";
import { db } from "../config/supabase.js";
import { orThrow } from "../lib/errors.js";
import { logActivity } from "../lib/activity.js";
import { parse } from "../lib/validate.js";
import {
  EXPORT_CHUNK,
  EXPORT_FORMATS,
  EXPORT_LIMIT,
  endOfDay,
  exportRanges,
  searchFields,
  searchFilter,
  sortColumn,
} from "../lib/query.js";
import { currentUser, requireAuth, requireResidency, requireRole } from "../middleware/auth.js";
import { present, type Report } from "../services/reports.common.js";
import { REPORT_ROW_FIELDS } from "../services/reports.rows.js";
import { applyLogFilters, logFilterFields, logSelect } from "../lib/log-filters.js";
import { scopeReportQuery } from "../services/reports.access.js";
import { STATUSES } from "../services/reports.workflow.js";

// Table exports. These return the rows behind a table, every matching one rather
// than a page of them, and the browser turns them into a CSV or PDF of the columns
// the person has on screen (src/web/lib/export.ts). Keeping the file format out of
// the server means an export can never include a column the table had hidden.
const router = Router();
// UA-8: a citizen locked to the proof upload reaches none of this.
router.use(requireAuth, requireResidency);

// The same filters GET /api/reports accepts, minus paging, plus the format.
export const reportExportSchema = z.object({
  ...searchFields,
  status: z.enum(STATUSES).optional(),
  category_id: z.coerce.number().int().positive().optional(),
  format: z.enum(EXPORT_FORMATS).default("csv"),
});

// The same filters as GET /api/admin/logs (B9), so the file matches the screen.
export const logExportSchema = z.object({
  ...logFilterFields,
  format: z.enum(EXPORT_FORMATS).default("csv"),
});

// Reads every row a query matches, up to EXPORT_LIMIT, one chunk at a time.
// `build` returns a fresh, fully filtered query each call: a supabase-js query is
// spent once it is awaited, so each chunk needs its own.
type Chunk = { data: unknown[] | null; error: { message: string } | null; count: number | null };
type RangeQuery = { range(from: number, to: number): PromiseLike<Chunk> };

async function readAll(build: () => RangeQuery, message: string) {
  const first = await build().range(0, EXPORT_CHUNK - 1);
  const rows = [...orThrow(first, message)];
  const total = first.count ?? rows.length;

  for (const [from, to] of exportRanges(total).slice(1)) {
    rows.push(...orThrow(await build().range(from, to), message));
  }

  const kept = rows.slice(0, EXPORT_LIMIT);
  return { rows: kept, total, capped: total > kept.length };
}

// GET /api/exports/reports — scoped by role exactly as GET /api/reports is.
router.get("/reports", async (req, res) => {
  const { status, category_id, q, from, to, sort, format } = parse(reportExportSchema, req.query);
  const user = currentUser(req);
  const order = sortColumn(sort);
  const search = q && searchFilter(q);

  const build = () => {
    let query = db
      .from("reports")
      .select(REPORT_ROW_FIELDS, { count: "exact" })
      .order(order.column, { ascending: order.ascending })
      // A tiebreaker, so rows that share a sort value cannot shift between chunks.
      .order("id", { ascending: true });

    // The role scope comes first and never from user input, so a filter can only
    // narrow what this caller was already allowed to see.
    query = scopeReportQuery(query, user);
    if (status) query = query.eq("status", status);
    if (category_id) query = query.eq("category_id", category_id);
    if (from) query = query.gte("submitted_at", from);
    if (to) query = query.lte("submitted_at", endOfDay(to));
    if (search) query = query.or(search);
    return query;
  };

  const { rows, total, capped } = await readAll(build, "Reports could not be exported.");

  await logActivity(req, "export.reports", { entityType: "report", metadata: { format, count: rows.length } });

  res.json({
    reports: (rows as unknown as Report[]).map(present),
    total,
    capped,
    limit: EXPORT_LIMIT,
  });
});

// GET /api/exports/logs — the system-wide activity log, newest first. Admin only,
// like the log screen itself.
router.get("/logs", requireRole("admin"), async (req, res) => {
  const { format, ...filters } = parse(logExportSchema, req.query);

  const build = () =>
    applyLogFilters(
      db
        .from("activity_logs")
        .select(logSelect(filters), { count: "exact" })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false }),
      filters,
    );

  const { rows, total, capped } = await readAll(build, "The activity log could not be exported.");

  await logActivity(req, "export.logs", { entityType: "activity_log", metadata: { format, count: rows.length } });

  res.json({ logs: rows, total, capped, limit: EXPORT_LIMIT });
});

export default router;
