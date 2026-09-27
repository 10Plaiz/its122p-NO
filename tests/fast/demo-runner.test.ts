import { describe, expect, it } from "bun:test";
import { checkTarget, validateManifest } from "../../scripts/demo/seed.js";
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
});
