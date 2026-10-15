import { describe, expect, it } from "bun:test";

// #63: a residency approval names its basis. Owner decisions 2026-10-15: the
// uploaded document after four checks, or the explicit no-document exception with
// a reason. Rejection is unchanged. The database re-checks the same rules
// (tests/database/residency-review.sql).

const { REVIEW_CHECKS: SERVER_CHECKS, RESIDENCY_CHECKS_ERROR, RESIDENCY_EXCEPTION_ERROR, RESIDENCY_METHOD_ERROR, residencyReviewSchema } =
  await import("../../src/server/routes/admin.routes.js");
const web = await import("../../src/web/components/ResidencyReview.js");

const VERSION = "c0000000-0000-4000-8000-000000000010";
const ALL = ["name", "address", "readable", "document"];
const parse = (body: Record<string, unknown>) => residencyReviewSchema.safeParse({ expected_version: VERSION, ...body });
const firstError = (body: Record<string, unknown>) => {
  const result = parse(body);
  return result.success ? undefined : result.error.issues[0]?.message;
};

describe("REV-01 an approval with the document needs all four checks", () => {
  it("accepts the four checks in any order", () => {
    expect(parse({ decision: "verified", method: "document", checks: ALL }).success).toBe(true);
    expect(parse({ decision: "verified", method: "document", checks: [...ALL].reverse() }).success).toBe(true);
  });

  it("refuses missing, repeated, or unknown checks", () => {
    expect(firstError({ decision: "verified", method: "document" })).toBe(RESIDENCY_CHECKS_ERROR);
    expect(firstError({ decision: "verified", method: "document", checks: ["name", "address", "readable"] })).toBe(RESIDENCY_CHECKS_ERROR);
    expect(firstError({ decision: "verified", method: "document", checks: ["name", "name", "readable", "document"] })).toBe(RESIDENCY_CHECKS_ERROR);
    expect(parse({ decision: "verified", method: "document", checks: ["name", "address", "readable", "face"] }).success).toBe(false);
  });

  it("takes no reason, so nothing is silently dropped", () => {
    expect(parse({ decision: "verified", method: "document", checks: ALL, note: "Looks fine." }).success).toBe(false);
  });
});

describe("REV-02 approval without a document is an explicit exception with a reason", () => {
  it("needs a reason of 5 to 500 characters", () => {
    expect(parse({ decision: "verified", method: "no_document", note: "Saw the original certificate." }).success).toBe(true);
    expect(firstError({ decision: "verified", method: "no_document" })).toBe(RESIDENCY_EXCEPTION_ERROR);
    expect(firstError({ decision: "verified", method: "no_document", note: " ok " })).toBe(RESIDENCY_EXCEPTION_ERROR);
    expect(parse({ decision: "verified", method: "no_document", note: "x".repeat(501) }).success).toBe(false);
  });

  it("cannot carry document checks", () => {
    expect(parse({ decision: "verified", method: "no_document", note: "Known resident.", checks: ALL }).success).toBe(false);
  });

  it("refuses an approval that names no basis", () => {
    expect(firstError({ decision: "verified" })).toBe(RESIDENCY_METHOD_ERROR);
    expect(parse({ decision: "verified", method: "trust me" }).success).toBe(false);
  });
});

describe("REV-03 rejection is unchanged and has no approval basis", () => {
  it("still needs the reason the Citizen reads", () => {
    expect(parse({ decision: "rejected", note: "The bill is from Taguig." }).success).toBe(true);
    expect(parse({ decision: "rejected" }).success).toBe(false);
  });

  it("refuses a method or checks on a rejection", () => {
    expect(parse({ decision: "rejected", note: "The bill is from Taguig.", method: "document" }).success).toBe(false);
    expect(parse({ decision: "rejected", note: "The bill is from Taguig.", checks: ALL }).success).toBe(false);
  });
});

describe("REV-04 the dialog and the server agree", () => {
  it("offers exactly the server's checks", () => {
    expect(web.REVIEW_CHECKS.map((check) => check.id)).toEqual([...SERVER_CHECKS]);
  });

  it("words the exception reason error the same way", () => {
    expect(web.RESIDENCY_EXCEPTION_ERROR).toBe(RESIDENCY_EXCEPTION_ERROR);
    for (const note of ["", " ok ", "Saw the original certificate.", "x".repeat(501)]) {
      const server = parse({ decision: "verified", method: "no_document", note });
      expect(web.validateResidencyNote(note, web.RESIDENCY_EXCEPTION_ERROR)).toBe(
        server.success ? undefined : server.error.issues[0]?.message,
      );
    }
  });
});
