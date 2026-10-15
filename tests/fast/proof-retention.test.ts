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
    rpc: async (name: string, args: { p_limit?: number; p_ids?: string[] }) => {
      if (name === "record_residency_proof_files_removed") {
        calls.recordCalls += 1;
        if (calls.recordCalls === failRecordOn) return { data: null, error: { message: "update failed" } };
        const fresh = (args.p_ids ?? []).filter((id) => !recorded.has(id));
        calls.records.push(args.p_ids ?? []);
        for (const id of fresh) recorded.add(id);
        return { data: fresh.length, error: null };
      }
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
    // Rows are never written directly: removals are recorded by the database function.
    from: () => { calls.deletes += 1; throw new Error("no direct table access"); },
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
    expect(result).toMatchObject({ removed: files.length, recorded: PURGE_BATCH_SIZE + 5, failed: 0 });
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

  test("a failed record counts the files as removed, leaves the proofs listed, and the rerun records them", async () => {
    const { client, calls, recorded } = fakeClient(replaced(2), { failRecordOn: 1 });
    const first = await purgeExpiredProofs({}, client);
    expect(first).toMatchObject({ removed: 2, recorded: 0, failed: 0, error: "update failed" });
    expect(recorded.size).toBe(0);
    const second = await purgeExpiredProofs({}, client);
    expect(second).toMatchObject({ replaced: 2, removed: 2, recorded: 2, failed: 0 });
    expect(calls.removes).toHaveLength(2);
    expect(recorded.size).toBe(2);
  });

  test("a listing failure throws before anything is removed", async () => {
    const { client, calls } = fakeClient(replaced(1), { listError: true });
    await expect(purgeExpiredProofs({}, client)).rejects.toThrow("The expired proof files could not be listed.");
    expect(calls.removeCalls).toBe(0);
  });
});

describe("PRET-06 the run is recorded before anything is removed", () => {
  test("a failed record of the start removes nothing", async () => {
    const { client, calls, stored } = fakeClient([...replaced(1), ...unattached(1)]);
    const beforeRemove = async () => { throw new Error("audit failed"); };
    await expect(purgeExpiredProofs({ beforeRemove }, client)).rejects.toThrow("audit failed");
    expect(calls.removeCalls).toBe(0);
    expect(stored.size).toBe(2);
  });

  test("the start record carries the listed counts; dry runs and empty runs skip it", async () => {
    const seen: unknown[] = [];
    const beforeRemove = async (listed: unknown) => { seen.push(listed); };
    await purgeExpiredProofs({ dryRun: true, beforeRemove }, fakeClient(replaced(1)).client);
    await purgeExpiredProofs({ beforeRemove }, fakeClient([]).client);
    expect(seen).toEqual([]);
    await purgeExpiredProofs({ beforeRemove }, fakeClient([...replaced(2), ...unattached(1)]).client);
    expect(seen).toEqual([expect.objectContaining({ dry_run: false, replaced: 2, unattached: 1, removed: 0 })]);
  });
});

describe("PRET-05 a long backlog takes more than one run", () => {
  test("says so when a kind reaches the limit", async () => {
    const { client } = fakeClient(unattached(PROOF_PURGE_LIMIT + 1));
    const result = await purgeExpiredProofs({ dryRun: true }, client);
    expect(result).toMatchObject({ unattached: PROOF_PURGE_LIMIT, more: true });
  });
});
