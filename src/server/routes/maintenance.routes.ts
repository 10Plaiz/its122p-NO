import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { ApiError } from "../lib/errors.js";
import { parse } from "../lib/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { logActivity } from "../lib/activity.js";
import { purgeCancelledPhotos } from "../lib/retention.js";

// Admin maintenance tasks. Nothing here deletes a database row (DM-1): the retention
// purge removes stored files only and marks their photo rows as purged.
const router = Router();
router.use(requireAuth, requireRole("admin"));

export const purgeSchema = z.object({
  dry_run: z.boolean().optional(),
});

// POST /api/maintenance/purge-cancelled-photos — removes the photo files of reports
// cancelled more than 90 days ago (DM-2). `dry_run: true` reports what would go
// without touching anything. Safe to run again: purged photos are skipped.
router.post("/purge-cancelled-photos", async (req: Request, res: Response) => {
  const { dry_run } = parse(purgeSchema, req.body ?? {});
  const result = await purgeCancelledPhotos({ now: new Date(), dryRun: dry_run ?? false });

  // Logged even when a batch failed, so the files that did go are on the record.
  await logActivity(req, "maintenance.photos_purged", { entityType: "report_photo", metadata: { ...result } });

  if (result.error) {
    throw new ApiError(500, "Some photo files could not be removed. Run the purge again to finish.", result);
  }
  res.json({ result });
});

export default router;
