process.env.SUPABASE_URL ??= "https://placeholder.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "placeholder-publishable-key";
process.env.SUPABASE_SECRET_KEY ??= "placeholder-secret-key";

import { describe, expect, test } from "bun:test";

// #70: the database decides which proof files are past 30 days
// (tests/database/proof-retention.sql). These tests cover what the API does with
// that list: dry run, batches, recording, failures, and reruns.
const { PROOF_PURGE_LIMIT, PROOF_RETENTION_DAYS, purgeExpiredProofs } = await import("../../src/server/lib/proof-retention.js");
const { PURGE_BATCH_SIZE } = await import("../../src/server/lib/retention.js");

type Client = NonNullable<Parameters<typeof purgeExpiredProofs>[1]>;
type File = { kind: "replaced" | "unattached"; version_id: string | null; object_path: string };

// Stands in for the RPC, Storage, and the one update the purge makes. The RPC
// lists only files that are still stored and not yet recorded, as the database does.
function fakeClient(files: File[], { failRemoveOn, failRecordOn, listError }: { failRemoveOn?: number; failRecordOn?: number; listError?: boolean } = {}) {
  const stored = new Set(files.map((file) => file.object_path));
  const recorded = new Set<string>();
  const calls = { removes: [] as string[][], records: [] as string[][], deletes: 0, removeCalls: 0, recordCalls: 0 };

  const client = {
    rpc: async (name: string, args: { p_limit: number }) => {
      expect(name).toBe("expired_residency_proof_files");
      if (listError) return { data: null, error: { message: "listing failed" } };
      const pending = files.filter((file) => file.kind === "replaced" ? !recorded.has(file.version_id!) : stored.has(file.object_path));
      const take = (kind: File["kind"]) => pending.filter((file) => file.kind === kind).slice(0, args.p_limit);
      return { data: [...take("replaced"), ...take("unattached")], error: null };
    },
    storage: {
      from: (bucket: string) => {
        expect(bucket).toBe("residency-proofs");
        return {
          remove: async (paths: string[]) => {
            calls.removeCalls += 1;
            if (calls.removeCalls === failRemoveOn) return { data: null, error: { message: "Storage refused" } };
            calls.removes.push(paths);
            for (const path of paths) stored.delete(path);
            return { data: [], error: null };
          },
        };
      },
    },
    from: (table: string) => {
      expect(table).toBe("residency_proof_versions");
      return {
        delete: () => { calls.deletes += 1; throw new Error("rows are never deleted"); },
        update: (patch: Record<string, unknown>) => ({
          in: async (column: string, ids: string[]) => {
            expect(column).toBe("id");
            expect(typeof patch.file_removed_at).toBe("string");
            calls.recordCalls += 1;
            if (calls.recordCalls === failRecordOn) return { data: null, error: { message: "update failed" } };
            calls.records.push(ids);
            for (const id of ids) recorded.add(id);
            return { data: null, error: null };
          },
        }),
      };
    },
  } as unknown as Client;
  return { client, calls, stored, recorded };
}

const replaced = (n: number): File[] =>
  Array.from({ length: n }, (_, i) => ({ kind: "replaced", version_id: `v${i}`, object_path: `user/replaced-${i}.pdf` }));
const unattached = (n: number): File[] =>
  Array.from({ length: n }, (_, i) => ({ kind: "unattached", version_id: null, object_path: `user/unattached-${i}.pdf` }));

describe("PRET-01 the rule", () => {
  test("keeps files 30 days, as the owner decided", () => {
    expect(PROOF_RETENTION_DAYS).toBe(30);
  });
});

describe("PRET-02 a dry run only counts", () => {
  test("reports both kinds and touches nothing", async () => {
    const { client, calls } = fakeClient([...replaced(2), ...unattached(1)]);
    const result = await purgeExpiredProofs({ dryRun: true }, client);
    expect(result).toMatchObject({ dry_run: true, retention_days: 30, replaced: 2, unattached: 1, removed: 0, failed: 0, more: false });
    expect(calls.removes).toEqual([]);
    expect(calls.records).toEqual([]);
  });
});

describe("PRET-03 a run removes files, then records replaced proofs", () => {
  test("removes in batches and records only proofs that have a row", async () => {
    const files = [...replaced(PURGE_BATCH_SIZE + 5), ...unattached(3)];
    const { client, calls, stored, recorded } = fakeClient(files);
    const result = await purgeExpiredProofs({}, client);
    expect(result).toMatchObject({ removed: files.length, failed: 0 });
    expect(calls.removes.map((batch) => batch.length)).toEqual([PURGE_BATCH_SIZE, 8]);
    expect(stored.size).toBe(0);
    expect(recorded.size).toBe(PURGE_BATCH_SIZE + 5);
    expect(calls.records.flat()).not.toContain(null);
    expect(calls.deletes).toBe(0);
  });

  test("a rerun finds nothing left", async () => {
    const { client } = fakeClient([...replaced(3), ...unattached(2)]);
    await purgeExpiredProofs({}, client);
    expect(await purgeExpiredProofs({}, client)).toMatchObject({ replaced: 0, unattached: 0, removed: 0 });
  });

  test("an empty list does nothing", async () => {
    const { client, calls } = fakeClient([]);
    expect(await purgeExpiredProofs({}, client)).toMatchObject({ replaced: 0, unattached: 0, removed: 0, failed: 0 });
    expect(calls.removeCalls).toBe(0);
  });
});

describe("PRET-04 failures stop the run and a rerun finishes it", () => {
  test("a refused Storage batch records nothing for it", async () => {
    const { client, recorded } = fakeClient(replaced(PURGE_BATCH_SIZE * 2), { failRemoveOn: 2 });
    const first = await purgeExpiredProofs({}, client);
    expect(first).toMatchObject({ removed: PURGE_BATCH_SIZE, failed: PURGE_BATCH_SIZE, error: "Storage refused" });
    expect(recorded.size).toBe(PURGE_BATCH_SIZE);
    const second = await purgeExpiredProofs({}, client);
    expect(second).toMatchObject({ replaced: PURGE_BATCH_SIZE, removed: PURGE_BATCH_SIZE, failed: 0 });
    expect(recorded.size).toBe(PURGE_BATCH_SIZE * 2);
  });

  test("a failed record leaves the proof listed; the rerun removes again (a no-op) and records it", async () => {
    const { client, calls, recorded } = fakeClient(replaced(2), { failRecordOn: 1 });
    const first = await purgeExpiredProofs({}, client);
    expect(first).toMatchObject({ removed: 0, failed: 2, error: "update failed" });
    expect(recorded.size).toBe(0);
    const second = await purgeExpiredProofs({}, client);
    expect(second).toMatchObject({ replaced: 2, removed: 2, failed: 0 });
    expect(calls.removes).toHaveLength(2);
    expect(recorded.size).toBe(2);
  });

  test("a listing failure throws before anything is removed", async () => {
    const { client, calls } = fakeClient(replaced(1), { listError: true });
    await expect(purgeExpiredProofs({}, client)).rejects.toThrow("The expired proof files could not be listed.");
    expect(calls.removeCalls).toBe(0);
  });
});

describe("PRET-05 a long backlog takes more than one run", () => {
  test("says so when a kind reaches the limit", async () => {
    const { client } = fakeClient(unattached(PROOF_PURGE_LIMIT + 1));
    const result = await purgeExpiredProofs({ dryRun: true }, client);
    expect(result).toMatchObject({ unattached: PROOF_PURGE_LIMIT, more: true });
  });
});
