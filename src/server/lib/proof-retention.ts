import { db } from "../config/supabase.js";
import { orThrow } from "./errors.js";
import { chunk, PURGE_BATCH_SIZE } from "./retention.js";
import { RESIDENCY_BUCKET } from "./residency.js";

// Retention for residency proofs (#70, owner 2026-10-15). A proof file is kept 30
// days after it stops being current: after a replacement, or after the upload if
// it never reached an account. Rows are never deleted (DM-1); a replaced proof's
// row records file_removed_at. The database owns the rule
// (expired_residency_proof_files and a check constraint), so this file only
// removes what it is given and records it.
export const PROOF_RETENTION_DAYS = 30;

// One run handles at most this many files of each kind; a rerun takes the rest.
export const PROOF_PURGE_LIMIT = 1000;

type Client = Pick<typeof db, "from" | "rpc" | "storage">;

type Expired = { kind: "replaced" | "unattached"; version_id: string | null; object_path: string };

export type ProofPurgeResult = {
  dry_run: boolean;
  retention_days: number;
  replaced: number;    // files of replaced proofs past the period
  unattached: number;  // uploads that never reached an account, past the period
  removed: number;     // files removed in this run
  failed: number;      // files left for the next run because a batch failed
  more: boolean;       // the run hit its limit; run it again for the rest
  error?: string;
};

// Removes the expired files, then records each replaced proof's removal. Files
// go first: if recording fails, the next run removes the (already missing) files
// again, which Storage treats as a no-op, and records them then. A dry run only
// counts.
export async function purgeExpiredProofs(
  { dryRun = false }: { dryRun?: boolean } = {},
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
    failed: 0,
    more: replaced >= PROOF_PURGE_LIMIT || expired.length - replaced >= PROOF_PURGE_LIMIT,
  };
  if (dryRun) return result;

  for (const batch of chunk(expired, PURGE_BATCH_SIZE)) {
    const removed = await client.storage.from(RESIDENCY_BUCKET).remove(batch.map((file) => file.object_path));
    const ids = batch.flatMap((file) => (file.version_id ? [file.version_id] : []));
    const recorded = removed.error || ids.length === 0
      ? null
      : await client
          .from("residency_proof_versions")
          .update({ file_removed_at: new Date().toISOString() })
          .in("id", ids);

    const error = removed.error ?? recorded?.error;
    if (error) {
      // Stop here: what was removed so far is reported, and a rerun takes the rest.
      result.failed = expired.length - result.removed;
      result.error = error.message;
      return result;
    }
    result.removed += batch.length;
  }

  return result;
}
