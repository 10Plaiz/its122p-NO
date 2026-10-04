process.env.SUPABASE_URL ??= "https://placeholder.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "placeholder-publishable-key";
process.env.SUPABASE_SECRET_KEY ??= "placeholder-secret-key";

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

// SW-1 area routing (Phase 2 C7): staff ranked by category and barangay, the area
// list, the barangay filter, and the migration's barangay seed against the app's
// list. The database lookup itself (barangay_at) is checked on a local Supabase;
// see PHASE2_PLAN.md.

const { areaSchema, rankStaff } = await import("../../src/server/routes/staff.routes.js");
const { reportExportSchema } = await import("../../src/server/routes/exports.routes.js");
const { BARANGAYS: SERVER_BARANGAYS } = await import("../../src/server/lib/validate.js");
const { BARANGAYS: WEB_BARANGAYS } = await import("../../src/web/lib/barangays.js");

const MIGRATION = readFileSync(new URL("../../supabase/migrations/20261003000800_area_routing.sql", import.meta.url), "utf8");

const ROAD = { id: 1, name: "Road" };
function member(name: string, { road = false, areas = [] as string[], load = 0 } = {}) {
  return { id: name, name, email: `${name}@example.com`, specializations: road ? [ROAD] : [], areas, open_load: load };
}

describe("C7 staff ranking by category and barangay", () => {
  const staff = [
    member("Ana", { load: 0 }),
    member("Ben", { areas: ["Poblacion"], load: 1 }),
    member("Cora", { road: true, load: 2 }),
    member("Dan", { road: true, areas: ["Poblacion"], load: 5 }),
    member("Eve", { road: true, areas: ["Poblacion"], load: 1 }),
  ];

  it("lists both matches, then specialists, then area matches, then the rest", () => {
    const ranked = rankStaff(staff, ROAD.id, "Poblacion");
    expect(ranked.map((m) => m.name)).toEqual(["Eve", "Dan", "Cora", "Ben", "Ana"]);
    expect(ranked.map((m) => [m.is_specialist, m.in_area])).toEqual([
      [true, true],
      [true, true],
      [true, false],
      [false, true],
      [false, false],
    ]);
  });

  it("breaks ties within a group by open work, then by name", () => {
    const ranked = rankStaff([member("Zed", { areas: ["Bel-Air"] }), member("Amy", { areas: ["Bel-Air"] })], undefined, "Bel-Air");
    expect(ranked.map((m) => m.name)).toEqual(["Amy", "Zed"]);
  });

  it("marks nobody as in the area when the report has no barangay", () => {
    expect(rankStaff(staff, ROAD.id).every((m) => !m.in_area)).toBe(true);
  });

  it("keeps working for callers that send no areas", () => {
    const ranked = rankStaff([{ id: "x", name: "X", email: "x@example.com", specializations: [], open_load: 0 }], 1, "Poblacion");
    expect(ranked[0]).toMatchObject({ areas: [], in_area: false, is_specialist: false });
  });
});

describe("C7 the area list", () => {
  it("accepts barangays from the list, an empty list, and nothing else", () => {
    expect(areaSchema.safeParse({ barangays: ["Poblacion", "Forbes Park", "Dasmariñas"] }).success).toBe(true);
    expect(areaSchema.safeParse({ barangays: [] }).success).toBe(true);
    expect(areaSchema.safeParse({ barangays: ["Pembo"] }).success).toBe(false); // now Taguig
    expect(areaSchema.safeParse({ barangays: ["Poblacion", "Poblacion"] }).success).toBe(false);
    expect(areaSchema.safeParse({}).success).toBe(false);
  });

  it("lets the export narrow by barangay, from the list only", () => {
    expect(reportExportSchema.parse({ barangay: "San Lorenzo" }).barangay).toBe("San Lorenzo");
    expect(reportExportSchema.safeParse({ barangay: "Comembo" }).success).toBe(false);
  });
});

describe("C7 the migration agrees with the app", () => {
  const seeded = [...MIGRATION.matchAll(/^\s+\('([^']+)', \d+, polygon '/gm)].map((match) => match[1]);

  it("seeds exactly the 23 barangays the app offers, in the same spelling", () => {
    expect(seeded).toEqual([...WEB_BARANGAYS]);
    expect([...SERVER_BARANGAYS]).toEqual([...WEB_BARANGAYS]);
  });

  it("never cascades a delete (DM-1)", () => {
    expect(MIGRATION).not.toMatch(/on delete (cascade|set null|set default)/i);
    expect(MIGRATION.match(/references [^\n]+/g)?.every((line) => /on delete restrict/.test(line))).toBe(true);
  });

  it("keeps the new tables away from direct clients", () => {
    for (const table of ["barangays", "staff_areas"]) {
      expect(MIGRATION).toContain(`alter table public.${table} enable row level security;`);
      expect(MIGRATION).toContain(`revoke all on table public.${table} from public, anon, authenticated;`);
    }
  });
});
