import { describe, expect, test } from "bun:test";
import { BARANGAYS } from "../../src/server/lib/validate.js";
import { REPORTS, ROUTING } from "../../scripts/fixture/reports.js";
import { deriveRouting } from "../../scripts/demo/routing.js";

describe("SW-1 routing data for the fixture and demo staff", () => {
  test("fixture staff handle the fixture reports' categories in real Makati barangays", () => {
    const reportCategories = new Set(REPORTS.map((report) => report.category));
    for (const spec of ROUTING) {
      expect(spec.staff).toMatch(/^staff-\d$/);
      for (const category of spec.categories) expect(reportCategories.has(category)).toBe(true);
      for (const barangay of spec.barangays) expect(BARANGAYS).toContain(barangay as (typeof BARANGAYS)[number]);
    }
    // Every fixture report has a specialist to suggest.
    const handled = new Set(ROUTING.flatMap((spec) => spec.categories));
    for (const category of reportCategories) expect(handled.has(category)).toBe(true);
  });

  test("demo routing gives each staff member one row per category and barangay they work in", () => {
    const routing = deriveRouting([
      { staff_id: "b", category_id: 2, barangay: "Poblacion" },
      { staff_id: "a", category_id: 1, barangay: "Bel-Air" },
      { staff_id: "a", category_id: 1, barangay: "Bel-Air" },
      { staff_id: "a", category_id: 3, barangay: null },
    ]);
    expect(routing.specializations).toEqual([
      { staff_id: "a", category_id: 1 },
      { staff_id: "a", category_id: 3 },
      { staff_id: "b", category_id: 2 },
    ]);
    expect(routing.areas).toEqual([
      { staff_id: "a", barangay: "Bel-Air" },
      { staff_id: "b", barangay: "Poblacion" },
    ]);
  });

  test("demo routing is empty when nobody has assigned reports", () => {
    expect(deriveRouting([])).toEqual({ specializations: [], areas: [] });
  });
});
