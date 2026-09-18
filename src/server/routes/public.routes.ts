import { Router } from "express";
import { z } from "zod";
import { db } from "../config/supabase.js";
import { orThrow } from "../lib/errors.js";
import { parse } from "../lib/validate.js";
import { photoUrl } from "../lib/photos.js";
import { STATUSES } from "../services/reports.service.js";

const router = Router();

// The transparency board. No sign-in, and no citizen details — it reads from the
// public_reports view, which only exposes reviewed reports and non-personal columns.
router.get("/reports", async (req, res) => {
  const { status, page, per_page } = parse(
    z.object({
      status: z.enum(STATUSES).optional(),
      page: z.coerce.number().int().min(1).default(1),
      per_page: z.coerce.number().int().min(1).max(100).default(50),
    }),
    req.query,
  );

  let query = db
    .from("public_reports")
    .select("*", { count: "exact" })
    .order("submitted_at", { ascending: false })
    .range((page - 1) * per_page, page * per_page - 1);

  if (status) query = query.eq("status", status);

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

export default router;
