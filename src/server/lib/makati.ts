import type { z } from "zod";
import { MAKATI_ERROR, isInsideMakati } from "./makati-boundary.js";

// KAMOTI serves one LGU, so a report pinned outside Makati is a mistake, never a
// report: the instructor's test pin landed in Bataan and was accepted. The map stops
// most of these in the browser; this is the check a caller that skips the map still
// has to pass. The boundary itself, and where it came from, is in makati-boundary.ts.
export { MAKATI_BBOX, MAKATI_ERROR, isInsideMakati } from "./makati-boundary.js";
export type { BoundingBox } from "./makati-boundary.js";

export const COORDINATES_TOGETHER_ERROR = "Send latitude and longitude together.";

type Coordinates = { latitude?: number | null; longitude?: number | null };

// For `.superRefine` on the report schemas. A pin is checked only when one is sent,
// so an edit that changes the title alone passes; half a pin is refused because it
// cannot be checked without the other half. The issue is put on `latitude`, the
// field the form shows the pin's error under.
//
// zod refuses `.partial()` on an object that already carries a refinement, so apply
// this after the partial, not before:
//   const fields = z.object({ ... });
//   export const createSchema = fields.superRefine(refineInsideMakati);
//   export const editSchema = fields.partial().refine(...).superRefine(refineInsideMakati);
export function refineInsideMakati<T extends Coordinates>(value: T, ctx: z.RefinementCtx<T>) {
  const hasLatitude = typeof value.latitude === "number";
  const hasLongitude = typeof value.longitude === "number";
  if (!hasLatitude && !hasLongitude) return;

  if (hasLatitude !== hasLongitude) {
    ctx.addIssue({
      code: "custom",
      path: [hasLatitude ? "longitude" : "latitude"],
      message: COORDINATES_TOGETHER_ERROR,
    });
    return;
  }

  if (!isInsideMakati(value.latitude as number, value.longitude as number)) {
    ctx.addIssue({ code: "custom", path: ["latitude"], message: MAKATI_ERROR });
  }
}
