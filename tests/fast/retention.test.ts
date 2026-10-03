process.env.SUPABASE_URL ??= "https://placeholder.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "placeholder-publishable-key";
process.env.SUPABASE_SECRET_KEY ??= "placeholder-secret-key";

import { describe, expect, test } from "bun:test";

const { PURGE_BATCH_SIZE, RETENTION_DAYS, cancelledAt, chunk, purgeCancelledPhotos, retentionCutoff } =
  await import("../../src/server/lib/retention.js");
const { photoUrl } = await import("../../src/server/lib/photos.js");
const { purgeSchema } = await import("../../src/server/routes/maintenance.routes.js");

type Client = NonNullable<Parameters<typeof purgeCancelledPhotos>[1]>;

const NOW = new Date("2026-10-02T00:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

// A stand-in for the few supabase-js calls the purge makes. Reads answer from the
// fixtures; every write is recorded so a test can check that rows were only ever
// updated, never deleted.
type Photo = { id: string; report_id: string; storage_path: string; purged_at: string | null };
type Report = { id: string; status: string; updated_at: string };
type Update = { report_id: string; new_status: string; created_at: string };

function fakeClient({ photos, reports, updates, failRemoveOn }: { photos: Photo[]; reports: Report[]; updates: Update[]; failRemoveOn?: number }) {
  const calls = { removed: [] as string[][], stamped: [] as { ids: string[]; purged_at: string }[], deletes: 0 };

  function builder(table: string) {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    let range: [number, number] | null = null;
    let patch: Record<string, unknown> | null = null;

    const run = () => {
      if (patch) {
        const ids = (filters.length ? photos.filter((row) => filters.every((keep) => keep(row))) : []).map((row) => row.id);
        calls.stamped.push({ ids, purged_at: patch.purged_at as string });
        for (const photo of photos) if (ids.includes(photo.id)) Object.assign(photo, patch);
        return { data: null, error: null };
      }

      let rows: Record<string, unknown>[];
      if (table === "report_photos") {
        rows = photos.map((photo) => ({ ...photo, report: reports.find((report) => report.id === photo.report_id) }));
      } else if (table === "report_updates") {
        rows = updates;
      } else {
        throw new Error(`unexpected table ${table}`);
      }

      rows = rows.filter((row) => filters.every((keep) => keep(row)));
      if (range) rows = rows.slice(range[0], range[1] + 1);
      return { data: rows, error: null };
    };

    const query = {
      select: () => query,
      order: () => query,
      is: (column: string, value: unknown) => (filters.push((row) => row[column] === value), query),
      eq: (column: string, value: unknown) => {
        const [parent, field] = column.split(".");
        filters.push((row) =>
          field ? (row[parent] as Record<string, unknown> | undefined)?.[field] === value : row[column] === value,
        );
        return query;
      },
      in: (column: string, values: unknown[]) => (filters.push((row) => values.includes(row[column])), query),
      range: (from: number, to: number) => ((range = [from, to]), query),
      update: (values: Record<string, unknown>) => ((patch = values), query),
      delete: () => {
        calls.deletes += 1;
        return query;
      },
      then: (resolve: (value: unknown) => unknown) => resolve(run()),
    };
    return query;
  }

  const client = {
    from: builder,
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          calls.removed.push(paths);
          if (failRemoveOn === calls.removed.length) return { data: null, error: { message: "Storage is unavailable." } };
          return { data: [], error: null };
        },
      }),
    },
  } as unknown as Client;

  return { client, calls };
}

describe("DM-2 retention window", () => {
  test("is 90 days", () => {
    expect(RETENTION_DAYS).toBe(90);
    expect(retentionCutoff(NOW).toISOString()).toBe(daysAgo(90));
  });

  test("dates a cancellation by its latest status change, not updated_at", () => {
    expect(cancelledAt(daysAgo(1), [daysAgo(120), daysAgo(100)])).toBe(Date.parse(daysAgo(100)));
  });

  test("falls back to updated_at when the history has no cancellation", () => {
    expect(cancelledAt(daysAgo(95), [])).toBe(Date.parse(daysAgo(95)));
    expect(cancelledAt(daysAgo(95), undefined)).toBe(Date.parse(daysAgo(95)));
  });

  test("splits work into batches", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });
});

describe("DM-2 purgeCancelledPhotos", () => {
  function fixtures() {
    return {
      reports: [
        { id: "old", status: "cancelled", updated_at: daysAgo(5) },        // cancelled 100 days ago, touched since
        { id: "recent", status: "cancelled", updated_at: daysAgo(10) },    // cancelled 10 days ago
        { id: "legacy", status: "cancelled", updated_at: daysAgo(91) },    // no history row: falls back
        { id: "open", status: "pending", updated_at: daysAgo(400) },       // never cancelled
      ],
      updates: [
        { report_id: "old", new_status: "cancelled", created_at: daysAgo(100) },
        { report_id: "recent", new_status: "cancelled", created_at: daysAgo(10) },
      ],
      photos: [
        { id: "p1", report_id: "old", storage_path: "old/initial-1.jpg", purged_at: null },
        { id: "p2", report_id: "old", storage_path: "old/initial-2.jpg", purged_at: null },
        { id: "p3", report_id: "recent", storage_path: "recent/initial-1.jpg", purged_at: null },
        { id: "p4", report_id: "legacy", storage_path: "legacy/initial-1.jpg", purged_at: null },
        { id: "p5", report_id: "open", storage_path: "open/initial-1.jpg", purged_at: null },
        { id: "p6", report_id: "old", storage_path: "old/initial-3.jpg", purged_at: daysAgo(3) },
      ] as Photo[],
    };
  }

  test("a dry run counts the expired photos and changes nothing", async () => {
    const { client, calls } = fakeClient(fixtures());
    const result = await purgeCancelledPhotos({ now: NOW, dryRun: true }, client);

    expect(result).toMatchObject({ dry_run: true, reports: 2, photos: 3, purged: 0, failed: 0 });
    expect(calls.removed).toEqual([]);
    expect(calls.stamped).toEqual([]);
  });

  test("removes the files of photos past the window and stamps their rows", async () => {
    const data = fixtures();
    const { client, calls } = fakeClient(data);
    const result = await purgeCancelledPhotos({ now: NOW }, client);

    expect(result).toMatchObject({ dry_run: false, reports: 2, photos: 3, purged: 3, failed: 0 });
    expect(calls.removed.flat().sort()).toEqual(["legacy/initial-1.jpg", "old/initial-1.jpg", "old/initial-2.jpg"]);
    expect(calls.stamped.flatMap((call) => call.ids).sort()).toEqual(["p1", "p2", "p4"]);
    expect(calls.stamped.every((call) => call.purged_at === NOW.toISOString())).toBe(true);

    // Rows stay; only their purged_at changed.
    expect(calls.deletes).toBe(0);
    expect(data.photos).toHaveLength(6);
    expect(data.photos.find((photo) => photo.id === "p3")?.purged_at).toBeNull();
    expect(data.photos.find((photo) => photo.id === "p5")?.purged_at).toBeNull();
  });

  test("a second run finds nothing left to purge", async () => {
    const data = fixtures();
    await purgeCancelledPhotos({ now: NOW }, fakeClient(data).client);

    const { client, calls } = fakeClient(data);
    const again = await purgeCancelledPhotos({ now: NOW }, client);
    expect(again).toMatchObject({ photos: 0, purged: 0 });
    expect(calls.removed).toEqual([]);
  });

  test("works in batches and stops at a failed batch without stamping it", async () => {
    const count = PURGE_BATCH_SIZE * 2 + 5;
    const photos: Photo[] = Array.from({ length: count }, (_, index) => ({
      id: `p${index}`,
      report_id: "old",
      storage_path: `old/initial-${index}.jpg`,
      purged_at: null,
    }));
    const { client, calls } = fakeClient({
      photos,
      reports: [{ id: "old", status: "cancelled", updated_at: daysAgo(200) }],
      updates: [],
      failRemoveOn: 2,
    });

    const result = await purgeCancelledPhotos({ now: NOW }, client);
    expect(calls.removed.map((batch) => batch.length)).toEqual([PURGE_BATCH_SIZE, PURGE_BATCH_SIZE]);
    expect(calls.stamped).toHaveLength(1);
    expect(result).toMatchObject({ photos: count, purged: PURGE_BATCH_SIZE, failed: count - PURGE_BATCH_SIZE });
    expect(result.error).toBe("Storage is unavailable.");
  });
});

describe("DM-2 purged photos have no URL", () => {
  test("keeps the one-argument behaviour", () => {
    expect(photoUrl("abc/initial-1.jpg")).toContain("abc/initial-1.jpg");
  });

  test("returns a URL while the file is kept and null once purged", () => {
    expect(photoUrl("abc/initial-1.jpg", null)).toContain("abc/initial-1.jpg");
    expect(photoUrl("abc/initial-1.jpg", daysAgo(1))).toBeNull();
  });
});

describe("DM-2 purge request", () => {
  test("accepts an empty body or a boolean dry_run", () => {
    expect(purgeSchema.safeParse({}).success).toBe(true);
    expect(purgeSchema.safeParse({ dry_run: true }).success).toBe(true);
  });

  test("rejects a dry_run that is not a boolean", () => {
    expect(purgeSchema.safeParse({ dry_run: "yes" }).success).toBe(false);
  });
});
