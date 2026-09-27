import { describe, expect, it } from "bun:test";
import { checkTarget, digest, missingRows, validateManifest } from "../../scripts/demo/seed.js";
import { generateSeed } from "../../scripts/demo/generate_seed.js";

describe("demo seed application boundaries", () => {
  it("requires an explicit project matching the configured HTTPS Supabase origin", () => {
    expect(() => checkTarget("https://demo.supabase.co", "demo")).not.toThrow();
    expect(() => checkTarget("https://demo.supabase.co", undefined)).toThrow();
    expect(() => checkTarget("https://other.supabase.co", "demo")).toThrow();
    expect(() => checkTarget("https://demo.supabase.co.attacker.invalid", "demo")).toThrow();
    expect(() => checkTarget("http://demo.supabase.co", "demo")).toThrow();
  });

  it("accepts a regenerated manifest but rejects injected records and changed ownership", () => {
    const original = generateSeed();
    expect(validateManifest(JSON.parse(JSON.stringify(original)))).toEqual(original);
    const changed = structuredClone(original);
    const first = changed.reports[0];
    if (!first) throw new Error("Missing generated reports");
    first.ownerKey = "fixture-citizen-1";
    expect(() => validateManifest(changed)).toThrow("Manifest differs");
    expect(() => validateManifest({ ...original, accounts: [...original.accounts, { key: "injected" }] })).toThrow("Manifest differs");
  });

  it("filters out existing records by id while preserving missing rows", () => {
    const planned = [{ id: "1", name: "one" }, { id: "2", name: "two" }, { id: 3, name: "three" }];
    const existing = [{ id: "1", name: "existing one" }, { id: "3", name: "coerced three" }];

    const missing = missingRows(planned, existing);
    expect(missing).toEqual([{ id: "2", name: "two" }]);
    expect(missingRows(planned, [])).toEqual(planned);
    expect(missingRows([], existing)).toEqual([]);
    expect(missingRows(planned, planned)).toEqual([]);
  });

  it("produces deterministic canonical digests regardless of object key order", () => {
    const objA = { b: 2, a: 1, nested: { z: 10, y: 20 } };
    const objB = { a: 1, nested: { y: 20, z: 10 }, b: 2 };
    const objC = { a: 1, nested: { y: 21, z: 10 }, b: 2 };

    expect(digest(objA)).toBe(digest(objB));
    expect(digest(objA)).not.toBe(digest(objC));
  });
});

