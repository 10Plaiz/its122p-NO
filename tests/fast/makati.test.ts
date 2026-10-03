import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { z } from "zod";
import {
  COORDINATES_TOGETHER_ERROR,
  MAKATI_BBOX,
  MAKATI_ERROR,
  isInsideMakati,
  refineInsideMakati,
} from "../../src/server/lib/makati.js";
import * as webMaps from "../../src/web/lib/maps.js";

// MP-2: pins are accepted inside Makati's current boundary only. The outside cases
// are the ones that matter: the instructor's Bataan pin, a neighbouring city, and
// the EMBO barangays that were Makati until the Supreme Court moved them to Taguig.
const INSIDE = [
  { name: "Makati City Hall, Poblacion", lat: 14.5683, lng: 121.0296 },
  { name: "Ayala Triangle Gardens", lat: 14.5573, lng: 121.0237 },
  { name: "Greenbelt, San Lorenzo", lat: 14.5526, lng: 121.0213 },
  { name: "Guadalupe Nuevo", lat: 14.5626, lng: 121.0453 },
];

const OUTSIDE = [
  { name: "Balanga, Bataan (the instructor's test pin)", lat: 14.676, lng: 120.536 },
  { name: "Pembo, now Taguig (EMBO)", lat: 14.544, lng: 121.061 },
  { name: "Comembo, now Taguig (EMBO)", lat: 14.55, lng: 121.064 },
  { name: "Rizal Park, Manila", lat: 14.5831, lng: 120.9794 },
  { name: "Manila South Cemetery, a Manila enclave inside Makati", lat: 14.566, lng: 121.0195 },
  { name: "Bonifacio Global City, Taguig", lat: 14.5509, lng: 121.0503 },
];

describe("MP-2 Makati boundary", () => {
  for (const { name, lat, lng } of INSIDE) {
    test(`accepts ${name}`, () => {
      expect(isInsideMakati(lat, lng)).toBe(true);
    });
  }

  for (const { name, lat, lng } of OUTSIDE) {
    test(`rejects ${name}`, () => {
      expect(isInsideMakati(lat, lng)).toBe(false);
    });
  }

  test("rejects coordinates that are not numbers", () => {
    expect(isInsideMakati(Number.NaN, 121.02)).toBe(false);
    expect(isInsideMakati(14.55, Number.POSITIVE_INFINITY)).toBe(false);
  });

  test("bounding box is the city's extent and holds every inside point", () => {
    expect(MAKATI_BBOX.south).toBeCloseTo(14.5297, 3);
    expect(MAKATI_BBOX.north).toBeCloseTo(14.5795, 3);
    expect(MAKATI_BBOX.west).toBeCloseTo(120.9988, 3);
    // East of this is Taguig since the EMBO transfer; the old Makati reached ~121.07.
    expect(MAKATI_BBOX.east).toBeLessThan(121.055);
    for (const { lat, lng } of INSIDE) {
      expect(lat).toBeGreaterThanOrEqual(MAKATI_BBOX.south);
      expect(lat).toBeLessThanOrEqual(MAKATI_BBOX.north);
      expect(lng).toBeGreaterThanOrEqual(MAKATI_BBOX.west);
      expect(lng).toBeLessThanOrEqual(MAKATI_BBOX.east);
    }
  });
});

describe("MP-2 report schema helper", () => {
  // Shaped the way breadcrumb B2 wires it into createSchema and editSchema.
  const fields = z.object({
    title: z.string(),
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180),
  });
  const createSchema = fields.superRefine(refineInsideMakati);
  const editSchema = fields
    .partial()
    .refine((changes) => Object.keys(changes).length > 0, "Send at least one field to change.")
    .superRefine(refineInsideMakati);

  function messages(result: { success: boolean; error?: z.ZodError }) {
    return result.error?.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) ?? [];
  }

  test("accepts a pin inside Makati, as multipart strings", () => {
    expect(createSchema.safeParse({ title: "Pothole", latitude: "14.5573", longitude: "121.0237" }).success).toBe(true);
  });

  test("rejects the Bataan pin with the map's message, on latitude", () => {
    const result = createSchema.safeParse({ title: "Pothole", latitude: 14.676, longitude: 120.536 });
    expect(result.success).toBe(false);
    expect(messages(result)).toEqual([`latitude: ${MAKATI_ERROR}`]);
  });

  test("an edit that leaves the pin alone is not checked", () => {
    expect(editSchema.safeParse({ title: "Pothole on the corner" }).success).toBe(true);
  });

  test("an edit that moves the pin to Taguig is rejected", () => {
    const result = editSchema.safeParse({ latitude: 14.544, longitude: 121.061 });
    expect(messages(result)).toEqual([`latitude: ${MAKATI_ERROR}`]);
  });

  test("an edit with half a pin is rejected", () => {
    expect(messages(editSchema.safeParse({ latitude: 14.5573 }))).toEqual([
      `longitude: ${COORDINATES_TOGETHER_ERROR}`,
    ]);
  });
});

describe("MP-2 parity", () => {
  test("the browser uses the server's boundary and message", () => {
    expect(webMaps.MAKATI_ERROR).toBe(MAKATI_ERROR);
    expect(webMaps.MAKATI_BBOX).toEqual(MAKATI_BBOX);
    for (const { lat, lng } of [...INSIDE, ...OUTSIDE]) {
      expect(webMaps.isInsideMakati(lat, lng)).toBe(isInsideMakati(lat, lng));
    }
  });

  test("the database CHECK box contains MAKATI_BBOX with a small margin", () => {
    const sql = readFileSync(
      new URL("../../supabase/migrations/20261003000600_makati_bounds.sql", import.meta.url),
      "utf8",
    );
    const lat = sql.match(/latitude\s+between\s+([\d.]+)\s+and\s+([\d.]+)/);
    const lng = sql.match(/longitude\s+between\s+([\d.]+)\s+and\s+([\d.]+)/);
    expect(lat).not.toBeNull();
    expect(lng).not.toBeNull();
    const [south, north] = [Number(lat![1]), Number(lat![2])];
    const [west, east] = [Number(lng![1]), Number(lng![2])];

    // Contains the box with at least ~100 m to spare, and is no looser than ~550 m.
    for (const [margin, label] of [
      [MAKATI_BBOX.south - south, "south"],
      [north - MAKATI_BBOX.north, "north"],
      [MAKATI_BBOX.west - west, "west"],
      [east - MAKATI_BBOX.east, "east"],
    ] as const) {
      expect({ label, ok: margin >= 0.001 && margin <= 0.005 }).toEqual({ label, ok: true });
    }
    expect(sql).toMatch(/not valid/i);
  });
});

// B2: the real report schemas, not a stand-in shaped like them. The route module
// reads the Supabase config on import, so placeholders are set first.
process.env.SUPABASE_URL ??= "https://placeholder.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "placeholder-publishable-key";
process.env.SUPABASE_SECRET_KEY ??= "placeholder-secret-key";
const routes = await import("../../src/server/routes/reports.submission.routes.js");
const { PIN_OUTSIDE_ERROR, pinError } = await import("../../src/web/lib/report-rules.js");
const { REPORTS: FIXTURE_REPORTS } = await import("../../scripts/fixture/reports.js");
const { generateSeed } = await import("../../scripts/demo/generate_seed.js");

describe("MP-2 report API schemas", () => {
  const report = {
    title: "Pothole near the corner",
    description: "A deep pothole damages tyres at this corner every day.",
    category_id: 1,
    primary_problem_id: 1,
    latitude: "14.5573",
    longitude: "121.0237",
  };

  function pinMessages(result: { success: boolean; error?: z.ZodError }) {
    return (
      result.error?.issues
        .filter((issue) => issue.path[0] === "latitude" || issue.path[0] === "longitude")
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`) ?? []
    );
  }

  test("a new report pinned inside Makati is accepted", () => {
    expect(routes.createSchema.safeParse(report).success).toBe(true);
  });

  for (const place of OUTSIDE) {
    test(`a new report pinned at ${place.name} is refused on latitude`, () => {
      const result = routes.createSchema.safeParse({ ...report, latitude: place.lat, longitude: place.lng });
      expect(result.success).toBe(false);
      expect(pinMessages(result)).toEqual([`latitude: ${MAKATI_ERROR}`]);
    });
  }

  test("the Makati rule runs with the other field rules, so every error shows at once", () => {
    const result = routes.createSchema.safeParse({ ...report, secondary_problem_id: 1, latitude: 14.676, longitude: 120.536 });
    const paths = result.error?.issues.map((issue) => issue.path[0]);
    expect(paths).toContain("latitude");
    expect(paths).toContain("secondary_problem_id");
  });

  test("an edit that leaves the pin alone passes, even for an old report outside Makati", () => {
    expect(routes.editSchema.safeParse({ title: "Pothole near the corner store" }).success).toBe(true);
  });

  test("an edit that moves the pin out of Makati is refused", () => {
    const result = routes.editSchema.safeParse({ latitude: 14.5831, longitude: 120.9794 });
    expect(pinMessages(result)).toEqual([`latitude: ${MAKATI_ERROR}`]);
  });

  test("an edit that moves the pin within Makati passes", () => {
    expect(routes.editSchema.safeParse({ latitude: 14.5526, longitude: 121.0213 }).success).toBe(true);
  });

  test("an edit with half a pin is refused", () => {
    expect(pinMessages(routes.editSchema.safeParse({ longitude: 121.0237 }))).toEqual([
      `latitude: ${COORDINATES_TOGETHER_ERROR}`,
    ]);
  });
});

describe("MP-2 report form pin rule", () => {
  test("no pin is left to the 'tap the map' rule", () => {
    expect(pinError(null)).toBeUndefined();
  });

  test("a pin inside Makati passes", () => {
    for (const place of INSIDE) expect(pinError({ lat: place.lat, lng: place.lng })).toBeUndefined();
  });

  test("a pin outside Makati gets the map's message", () => {
    for (const place of OUTSIDE) expect(pinError({ lat: place.lat, lng: place.lng })).toBe(PIN_OUTSIDE_ERROR);
    expect(PIN_OUTSIDE_ERROR).toContain(MAKATI_ERROR);
  });
});

describe("MP-2 seeded pins", () => {
  // The API refuses these pins and the database's bbox check refuses most of them,
  // so a seed with one outside Makati fails part-way (KI-04).
  test("every fixture report is inside Makati", () => {
    for (const spec of FIXTURE_REPORTS) {
      expect({ title: spec.title, inside: isInsideMakati(spec.latitude, spec.longitude) }).toEqual({
        title: spec.title,
        inside: true,
      });
    }
  });

  test("every demo report is inside Makati, jitter included, for several seeds", () => {
    for (const seed of [1, 17, 42, 2026]) {
      const outside = generateSeed({ seed }).reports.filter((r) => !isInsideMakati(r.latitude, r.longitude));
      expect(outside.map((r) => `${r.latitude},${r.longitude}`)).toEqual([]);
    }
  });
});

describe("SW-5 resolved pins", () => {
  test("resolved pins use the success colour; other statuses keep the mono palette", () => {
    expect(webMaps.STATUS_COLOR.resolved).toBe("var(--color-success-700)");
    for (const status of ["pending", "under_review", "in_progress", "cancelled"] as const) {
      expect(webMaps.STATUS_COLOR[status]).not.toContain("success");
    }
  });
});
