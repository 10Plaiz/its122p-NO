import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { ApiError } from "../lib/errors.js";
import { parse } from "../lib/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { logActivity } from "../lib/activity.js";
import { purgeCancelledPhotos } from "../lib/retention.js";
import { purgeExpiredProofs } from "../lib/proof-retention.js";

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

// POST /api/maintenance/purge-expired-proofs — removes residency proof files 30
// days after they stopped being current (#70). The database decides which files
// qualify; an account's current proof is never one of them. `dry_run: true` only
// counts. Safe to run again: recorded removals are skipped.
router.post("/purge-expired-proofs", async (req: Request, res: Response) => {
  const { dry_run } = parse(purgeSchema, req.body ?? {});
  // A removal is on the record before any file goes: if this audit fails, nothing is removed.
  const beforeRemove = async (listed: object) => {
    try {
      await logActivity(req, "maintenance.proofs_purged", { entityType: "residency_proof", metadata: { ...listed, phase: "started" }, required: true });
    } catch {
      throw new ApiError(503, "The cleanup could not be recorded first, so no file was removed. Try again in a minute.");
    }
  };
  const result = await purgeExpiredProofs({ dryRun: dry_run ?? false, beforeRemove });

  // The outcome, logged even when a batch failed, so what did go is on the record too.
  await logActivity(req, "maintenance.proofs_purged", { entityType: "residency_proof", metadata: { ...result, phase: dry_run ? "checked" : "finished" } });

  if (result.error) {
    throw new ApiError(500, "Some proof files could not be removed. Run the cleanup again to finish.", result);
  }
  res.json({ result });
});

export default router;
