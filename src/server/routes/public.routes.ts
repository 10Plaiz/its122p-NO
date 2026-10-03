import { Router } from "express";
import { z } from "zod";
import { db } from "../config/supabase.js";
import { orThrow } from "../lib/errors.js";
import { BARANGAYS, parse } from "../lib/validate.js";
import { photoUrl } from "../lib/photos.js";
import { endOfDay, pageFields, searchFields, searchFilter, sortColumn } from "../lib/query.js";
import { PUBLIC_STATUSES } from "../services/reports.service.js";

const router = Router();

// Only the three statuses the view can return are accepted, so a filter that could
// never match is rejected outright instead of quietly returning nothing.
const boardSchema = z.object({
  ...searchFields,
  ...pageFields(50, 100),
  status: z.enum(PUBLIC_STATUSES).optional(),
  category_id: z.coerce.number().int().positive().optional(),
  // SW-1: the board shows and filters by barangay (decision 2026-10-03).
  barangay: z.enum(BARANGAYS).optional(),
});

// The transparency board. No sign-in, and no citizen details — it reads from the
// public_reports view, which only exposes reviewed reports and non-personal columns.
router.get("/reports", async (req, res) => {
  const { status, category_id, barangay, q, from, to, sort, page, per_page } = parse(boardSchema, req.query);
  const order = sortColumn(sort);

  let query = db
    .from("public_reports")
    .select("*", { count: "exact" })
    .order(order.column, { ascending: order.ascending })
    .range((page - 1) * per_page, page * per_page - 1);

  if (status) query = query.eq("status", status);
  if (category_id) query = query.eq("category_id", category_id);
  if (barangay) query = query.eq("barangay", barangay);
  if (from) query = query.gte("submitted_at", from);
  if (to) query = query.lte("submitted_at", endOfDay(to));

  const search = q && searchFilter(q);
  if (search) query = query.or(search);

  const result = await query;
  const reports = orThrow(result, "The public board could not be loaded.");

  res.json({
    // The view carries the photo object keys; the URLs are built here.
    reports: reports.map((report) => ({
      ...report,
      photos: (report.photos as { storage_path: string }[]).map((photo) => ({ ...photo, url: photoUrl(photo.storage_path) })),
    })),
    page,
    per_page,
    total: result.count ?? 0,
  });
});

// GET /api/public/stats — the counts above the board. Read from the same view, so
// these numbers can never disclose more than the board itself already shows.
router.get("/stats", async (_req, res) => {
  const rows = orThrow(
    await db.from("public_reports").select("status"),
    "The board summary could not be loaded.",
  );

  const byStatus = Object.fromEntries(PUBLIC_STATUSES.map((status) => [status, 0])) as Record<
    (typeof PUBLIC_STATUSES)[number],
    number
  >;

  for (const row of rows) {
    const status = row.status as (typeof PUBLIC_STATUSES)[number];
    if (status in byStatus) byStatus[status] += 1;
  }

  res.json({ total: rows.length, by_status: byStatus });
});

export default router;
