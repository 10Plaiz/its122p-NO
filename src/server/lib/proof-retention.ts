import { db } from "../config/supabase.js";
import { orThrow } from "./errors.js";
import { chunk, PURGE_BATCH_SIZE } from "./retention.js";
import { RESIDENCY_BUCKET } from "./residency.js";

// Retention for residency proofs (#70, owner 2026-10-15). A proof file is kept 30
// days after it stops being current: after a replacement, or after it was stored
// if no proof record points to it. Rows are never deleted (DM-1); a replaced
// proof's row records file_removed_at. The database owns the rule
// (expired_residency_proof_files, record_residency_proof_files_removed, and a
// check constraint), so this file only removes what it is given and records it.
export const PROOF_RETENTION_DAYS = 30;

// One run handles at most this many files of each kind; a rerun takes the rest.
export const PROOF_PURGE_LIMIT = 1000;

type Client = Pick<typeof db, "rpc" | "storage">;

type Expired = { kind: "replaced" | "unattached"; version_id: string | null; object_path: string };

export type ProofPurgeResult = {
  dry_run: boolean;
  retention_days: number;
  replaced: number;    // files of replaced proofs past the period
  unattached: number;  // stored files no proof record points to, past the period
  removed: number;     // files removed from Storage in this run
  recorded: number;    // replaced proofs whose removal was recorded in this run
  failed: number;      // files left for the next run because a batch failed
  more: boolean;       // the run hit its limit; run it again for the rest
  error?: string;
};

// Removes the expired files, then records each replaced proof's removal.
// `beforeRemove` runs after the listing and before anything is removed; if it
// throws, nothing is removed. Files go first: if recording fails, the next run
// removes the (already missing) files again, which Storage treats as a no-op,
// and records them then. A dry run only counts.
export async function purgeExpiredProofs(
  { dryRun = false, beforeRemove }: { dryRun?: boolean; beforeRemove?: (listed: ProofPurgeResult) => Promise<void> } = {},
  client: Client = db,
): Promise<ProofPurgeResult> {
  const expired = orThrow(
    await client.rpc("expired_residency_proof_files", { p_limit: PROOF_PURGE_LIMIT }),
    "The expired proof files could not be listed.",
  ) as Expired[];

  const replaced = expired.filter((file) => file.kind === "replaced").length;
  const result: ProofPurgeResult = {
    dry_run: dryRun,
    retention_days: PROOF_RETENTION_DAYS,
    replaced,
    unattached: expired.length - replaced,
    removed: 0,
    recorded: 0,
    failed: 0,
    more: replaced >= PROOF_PURGE_LIMIT || expired.length - replaced >= PROOF_PURGE_LIMIT,
  };
  if (dryRun || expired.length === 0) return result;
  await beforeRemove?.({ ...result });

  for (const batch of chunk(expired, PURGE_BATCH_SIZE)) {
    const removed = await client.storage.from(RESIDENCY_BUCKET).remove(batch.map((file) => file.object_path));
    if (removed.error) {
      // Stop here: what was removed so far is reported, and a rerun takes the rest.
      result.failed = expired.length - result.removed;
      result.error = removed.error.message;
      return result;
    }
    result.removed += batch.length;

    const ids = batch.flatMap((file) => (file.version_id ? [file.version_id] : []));
    if (ids.length === 0) continue;
    const recorded = await client.rpc("record_residency_proof_files_removed", { p_ids: ids });
    if (recorded.error) {
      // These files are gone but not yet recorded; the next run lists them again,
      // removes them as a no-op, and records them.
      result.failed = expired.length - result.removed;
      result.error = recorded.error.message;
      return result;
    }
    result.recorded += Number(recorded.data ?? 0);
  }

  return result;
}
