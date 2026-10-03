import { db, PHOTO_BUCKET } from "../config/supabase.js";
import { orThrow } from "./errors.js";

// Retention for cancelled reports (DM-2). Rows are never deleted (DM-1): the report,
// its history, and its photo rows all stay. Only the image files go, once a report
// has been cancelled for longer than RETENTION_DAYS, and each photo row is stamped
// with purged_at so the record still shows that a photo was attached.
export const RETENTION_DAYS = 90;

// Storage's remove() takes a list of object keys; batches keep each request small
// and limit how much is left half-done if one of them fails.
export const PURGE_BATCH_SIZE = 100;

// PostgREST returns at most 1000 rows per request by default, and a long
// `in (...)` list makes for a long URL, so reads are paged and chunked.
const PAGE_SIZE = 1000;
const ID_CHUNK_SIZE = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

type Client = Pick<typeof db, "from" | "storage">;

type Candidate = { id: string; report_id: string; storage_path: string; report_updated_at: string };

export type PurgeResult = {
  dry_run: boolean;
  retention_days: number;
  cutoff: string;
  reports: number;   // cancelled reports with at least one photo past the cutoff
  photos: number;    // photo files past the cutoff and not yet purged
  purged: number;    // photo rows stamped with purged_at in this run
  failed: number;    // photos left for the next run because a batch failed
  error?: string;
};

export function retentionCutoff(now: Date) {
  return new Date(now.getTime() - RETENTION_DAYS * DAY_MS);
}

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size));
  return chunks;
}

// When a report was cancelled: its latest status change to 'cancelled'. Reports
// cancelled before the history was complete have none, so they fall back to
// updated_at, which is never earlier than the cancellation itself and so can only
// make the purge wait longer, never start early.
export function cancelledAt(reportUpdatedAt: string, cancellations: string[] | undefined) {
  const dates = (cancellations ?? []).map((date) => Date.parse(date)).filter((time) => !Number.isNaN(time));
  return dates.length > 0 ? Math.max(...dates) : Date.parse(reportUpdatedAt);
}

// Every photo of a cancelled report whose file has not been purged yet. The set
// shrinks as purges run, so reading all of it stays cheap.
async function loadCandidates(client: Client): Promise<Candidate[]> {
  const candidates: Candidate[] = [];

  for (let page = 0; ; page += 1) {
    const rows = orThrow(
      await client
        .from("report_photos")
        .select("id, report_id, storage_path, report:reports!inner ( status, updated_at )")
        .is("purged_at", null)
        .eq("report.status", "cancelled")
        .order("id")
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1),
      "The photos of cancelled reports could not be loaded.",
    ) as unknown as { id: string; report_id: string; storage_path: string; report: { updated_at: string } }[];

    for (const row of rows) {
      candidates.push({ id: row.id, report_id: row.report_id, storage_path: row.storage_path, report_updated_at: row.report.updated_at });
    }
    if (rows.length < PAGE_SIZE) return candidates;
  }
}

async function loadCancellations(client: Client, reportIds: string[]) {
  const byReport = new Map<string, string[]>();

  for (const ids of chunk(reportIds, ID_CHUNK_SIZE)) {
    const rows = orThrow(
      await client
        .from("report_updates")
        .select("report_id, created_at")
        .eq("new_status", "cancelled")
        .in("report_id", ids),
      "The cancellation dates could not be loaded.",
    ) as { report_id: string; created_at: string }[];

    for (const row of rows) byReport.set(row.report_id, [...(byReport.get(row.report_id) ?? []), row.created_at]);
  }

  return byReport;
}

// Removes the stored files of photos on reports cancelled more than RETENTION_DAYS
// before `now`, then stamps their rows with purged_at. Files go first: if stamping
// fails, the next run removes the (already missing) files again, which Storage
// treats as a no-op, and stamps them then. A dry run only counts.
export async function purgeCancelledPhotos(
  { now = new Date(), dryRun = false }: { now?: Date; dryRun?: boolean } = {},
  client: Client = db,
): Promise<PurgeResult> {
  const cutoff = retentionCutoff(now);

  const candidates = await loadCandidates(client);
  const cancellations = await loadCancellations(client, [...new Set(candidates.map((photo) => photo.report_id))]);
  const expired = candidates.filter(
    (photo) => cancelledAt(photo.report_updated_at, cancellations.get(photo.report_id)) < cutoff.getTime(),
  );

  const result: PurgeResult = {
    dry_run: dryRun,
    retention_days: RETENTION_DAYS,
    cutoff: cutoff.toISOString(),
    reports: new Set(expired.map((photo) => photo.report_id)).size,
    photos: expired.length,
    purged: 0,
    failed: 0,
  };
  if (dryRun) return result;

  for (const batch of chunk(expired, PURGE_BATCH_SIZE)) {
    const removed = await client.storage.from(PHOTO_BUCKET).remove(batch.map((photo) => photo.storage_path));
    const stamped = removed.error
      ? null
      : await client
          .from("report_photos")
          .update({ purged_at: now.toISOString() })
          .in("id", batch.map((photo) => photo.id));

    const error = removed.error ?? stamped?.error;
    if (error) {
      // Stop here: what was purged so far is reported, and a rerun picks up the rest.
      result.failed = expired.length - result.purged;
      result.error = error.message;
      return result;
    }
    result.purged += batch.length;
  }

  return result;
}
