process.env.SUPABASE_URL ??= "https://placeholder.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "placeholder-publishable-key";
process.env.SUPABASE_SECRET_KEY ??= "placeholder-secret-key";

import { afterEach, describe, expect, it } from "bun:test";
import type { NextFunction, Request, Response } from "express";

// Proof of residency (UA-8): the lock, the review rules, and the browser's copies
// of both. No live Supabase: the Auth client and profiles table are stubbed.

const { db } = await import("../../src/server/config/supabase.js");
const server = await import("../../src/server/lib/residency.js");
const web = await import("../../src/web/lib/residency.js");
const { ACCOUNT_ERROR_CODES } = await import("../../src/server/lib/accounts-errors.js");
const { ApiError } = await import("../../src/server/lib/errors.js");
const { requireAuth, requireResidency } = await import("../../src/server/middleware/auth.js");
const { default: adminRouter, residencyReviewSchema, phoneVerifiedSchema } = await import(
  "../../src/server/routes/admin.routes.js"
);
const { default: authRouter } = await import("../../src/server/routes/auth.routes.js");
const { RESIDENCY_NOTE_ERROR, validateResidencyNote } = await import("../../src/web/components/ResidencyReview.js");

const restore: Array<() => void> = [];
afterEach(() => {
  while (restore.length > 0) restore.pop()!();
});

function replace(target: object, key: string, value: unknown) {
  const record = target as Record<string, unknown>;
  const original = record[key];
  record[key] = value;
  restore.push(() => {
    record[key] = original;
  });
}

const VERSION = "c0000000-0000-4000-8000-000000000010";
const STATUSES = [null, "pending", "verified", "rejected"] as const;
const ROLES = ["citizen", "staff", "admin"] as const;

describe("RES-01 a citizen without an accepted proof is locked (UA-8)", () => {
  it("locks a citizen with no proof, or a rejected one, and nobody else", () => {
    const cases: Array<[string, string | null, boolean, ReturnType<typeof server.residencyStep>]> = [
      ["citizen", null, false, "upload"],
      ["citizen", "pending", false, "upload"],
      ["citizen", "pending", true, "pending"],
      ["citizen", "rejected", true, "rejected"],
      ["citizen", "verified", false, "verified"],
      ["staff", null, false, "verified"],
      ["admin", "pending", false, "verified"],
    ];
    for (const [role, residency_status, has_residency_proof, step] of cases) {
      expect(server.residencyStep({ role, residency_status, has_residency_proof })).toBe(step);
    }
    expect(server.residencyLocked({ role: "citizen", residency_status: "rejected", has_residency_proof: true })).toBe(true);
    expect(server.residencyLocked({ role: "citizen", residency_status: "pending", has_residency_proof: true })).toBe(false);
  });

  it("agrees with the browser in every combination", () => {
    for (const role of ROLES) {
      for (const residency_status of STATUSES) {
        for (const has_residency_proof of [true, false]) {
          const facts = { role, residency_status, has_residency_proof };
          expect(web.residencyStep(facts)).toBe(server.residencyStep(facts));
          expect(web.residencyLocked(facts)).toBe(server.residencyLocked(facts));
        }
      }
    }
    expect(web.RESIDENCY_REQUIRED).toBe(ACCOUNT_ERROR_CODES.residencyRequired);
  });
});

describe("RES-02 the server enforces the lock (UA-8)", () => {
  function run(user: unknown) {
    let passed: unknown = "not called";
    requireResidency({ user } as Request, {} as Response, ((error?: unknown) => {
      passed = error;
    }) as NextFunction);
    return passed;
  }

  it("refuses a locked citizen with a code the browser switches on", () => {
    const error = run({ id: "c1", role: "citizen", residency_status: "pending", has_residency_proof: false });
    expect(error).toBeInstanceOf(ApiError);
    expect((error as InstanceType<typeof ApiError>).status).toBe(403);
    expect((error as InstanceType<typeof ApiError>).details).toEqual({ code: "residency_required" });
    // Must not read as a deactivation, which the browser treats as a sign-out.
    expect((error as InstanceType<typeof ApiError>).message.toLowerCase()).not.toContain("deactivated");
  });

  it("lets through an unlocked citizen, staff, and admins", () => {
    expect(run({ role: "citizen", residency_status: "pending", has_residency_proof: true })).toBeUndefined();
    expect(run({ role: "staff", residency_status: null, has_residency_proof: false })).toBeUndefined();
    expect(run({ role: "admin" })).toBeUndefined();
  });

  it("gives requireAuth the residency facts without the file's path", async () => {
    replace(db.auth, "getUser", async () => ({ data: { user: { id: "c1" } }, error: null }));
    const row = {
      id: "c1",
      name: "Ana",
      email: "ana@example.com",
      role: "citizen",
      is_active: true,
      residency_status: "pending",
      residency_proof_path: "c1/residency-proof.pdf",
    };
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq"]) builder[method] = () => builder;
    builder.single = async () => ({ data: row, error: null });
    replace(db, "from", () => builder);

    const req = { get: (name: string) => (name.toLowerCase() === "authorization" ? "Bearer t" : undefined) } as Request;
    await requireAuth(req, {} as Response, (() => {}) as NextFunction);
    expect(req.user).toMatchObject({ id: "c1", residency_status: "pending", has_residency_proof: true });
    expect(req.user).not.toHaveProperty("residency_proof_path");
  });
});

describe("RES-03 rejecting a proof needs a reason the citizen can act on (UA-8)", () => {
  it("accepts without a note and rejects only with one", () => {
    expect(residencyReviewSchema.safeParse({ decision: "verified", expected_version: VERSION }).success).toBe(true);
    const bare = residencyReviewSchema.safeParse({ decision: "rejected", expected_version: VERSION });
    expect(bare.success).toBe(false);
    expect(bare.error?.issues[0]?.message).toBe(RESIDENCY_NOTE_ERROR);
    expect(residencyReviewSchema.safeParse({ decision: "rejected", expected_version: VERSION, note: "  no  " }).success).toBe(false);
    expect(residencyReviewSchema.safeParse({ decision: "rejected", expected_version: VERSION, note: "Address is in Taguig." }).success).toBe(true);
    expect(residencyReviewSchema.safeParse({ decision: "maybe" }).success).toBe(false);
  });

  it("checks the note in the browser the way the server does", () => {
    for (const note of ["", "  no  ", "Address is in Taguig.", "x".repeat(501)]) {
      const server = residencyReviewSchema.safeParse({ decision: "rejected", expected_version: VERSION, note });
      expect(validateResidencyNote(note)).toBe(server.success ? undefined : server.error.issues[0]?.message);
    }
  });

  it("needs a yes or no to mark a phone verified (UA-6 fallback)", () => {
    expect(phoneVerifiedSchema.safeParse({ verified: true }).success).toBe(true);
    expect(phoneVerifiedSchema.safeParse({ verified: "yes" }).success).toBe(false);
  });
});

describe("RES-04 the upload is checked the same way on both sides (UA-8)", () => {
  function file(type: string, size: number) {
    return new File([new Uint8Array(size)], "proof", { type });
  }

  it("shares the limits and messages", () => {
    expect(web.PROOF_MAX_BYTES).toBe(server.PROOF_MAX_BYTES);
    expect([...web.PROOF_TYPES].sort() as string[]).toEqual(Object.keys(server.PROOF_TYPES).sort());
    expect(web.PROOF_TYPE_ERROR).toBe(server.PROOF_TYPE_ERROR);
    expect(web.PROOF_SIZE_ERROR).toBe(server.PROOF_SIZE_ERROR);
    expect(web.PROOF_MISSING_ERROR).toBe(server.PROOF_MISSING_ERROR);
  });

  it("refuses a missing, wrong, or oversized file in the browser", () => {
    expect(web.validateProof(null)).toBe(web.PROOF_MISSING_ERROR);
    expect(web.validateProof(file("application/zip", 10))).toBe(web.PROOF_TYPE_ERROR);
    expect(web.validateProof(file("application/pdf", web.PROOF_MAX_BYTES + 1))).toBe(web.PROOF_SIZE_ERROR);
    expect(web.validateProof(file("application/pdf", 10))).toBeUndefined();
  });

  it("refuses a file whose bytes do not match its claimed type on the server", () => {
    const pdf = { mimetype: "application/pdf", buffer: Buffer.from("%PDF-1.7 rest") } as Express.Multer.File;
    expect(server.checkProof(pdf).extension).toBe("pdf");
    const renamed = { mimetype: "application/pdf", buffer: Buffer.from("MZ executable") } as Express.Multer.File;
    expect(() => server.checkProof(renamed)).toThrow();
    expect(() => server.checkProof(undefined)).toThrow();
  });
});

describe("RES-05 the routes exist, signed in and throttled (UA-6, UA-8)", () => {
  type Layer = { route?: { path: string; methods: Record<string, boolean>; stack: unknown[] } };
  function routes(router: unknown) {
    return ((router as { stack: Layer[] }).stack ?? [])
      .filter((layer) => layer.route)
      .map((layer) => `${Object.keys(layer.route!.methods)[0]} ${layer.route!.path}`);
  }

  it("lets a citizen upload their own proof", () => {
    expect(routes(authRouter)).toContain("post /me/residency-proof");
  });

  it("lets an administrator open, review, and mark a phone", () => {
    const admin = routes(adminRouter);
    expect(admin).toContain("get /users/:id/residency-proof");
    expect(admin).toContain("patch /users/:id/residency");
    expect(admin).toContain("patch /users/:id/phone-verified");
  });
});
