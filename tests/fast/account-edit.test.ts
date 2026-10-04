process.env.SUPABASE_URL ??= "https://placeholder.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "placeholder-publishable-key";
process.env.SUPABASE_SECRET_KEY ??= "placeholder-secret-key";

import { describe, expect, it } from "bun:test";

// Phase 2 C9: a citizen edits their own details (UA-13), and the PDF export's
// character clean-up (KI-20).

const { accountChanges, accountUpdateSchema } = await import("../../src/server/routes/auth.routes.js");
const { pdfText } = await import("../../src/web/lib/export.js");

const VERIFIED = { contact_number: "09171234567", barangay: "Poblacion", address_line: "12 Sample Street", residency_status: "verified" as const };
const input = (overrides: Record<string, unknown> = {}) =>
  accountUpdateSchema.parse({
    first_name: "Ana",
    last_name: "Reyes",
    contact_number: "09171234567",
    barangay: "Poblacion",
    address_line: "12 Sample Street",
    ...overrides,
  });

describe("UA-13 what a change of details does", () => {
  it("saves the name parts and the composed display name, and touches nothing else when only the name changes", () => {
    const { changes, phoneChanged, addressChanged } = accountChanges(VERIFIED, input({ middle_name: "Santos", suffix: "Jr." }));
    expect(changes).toMatchObject({ first_name: "Ana", middle_name: "Santos", last_name: "Reyes", suffix: "Jr.", name: "Ana Santos Reyes Jr." });
    expect(phoneChanged).toBe(false);
    expect(addressChanged).toBe(false);
    expect(changes).not.toHaveProperty("phone_verified_at");
    expect(changes).not.toHaveProperty("residency_status");
  });

  it("clears the verified mark when the number changes or is removed (UA-6)", () => {
    expect(accountChanges(VERIFIED, input({ contact_number: "09181234567" })).changes.phone_verified_at).toBeNull();
    const removed = accountChanges(VERIFIED, input({ contact_number: undefined }));
    expect(removed.phoneChanged).toBe(true);
    expect(removed.changes).toMatchObject({ contact_number: null, phone_verified_at: null });
  });

  it("sends a verified or pending residency back to review when the barangay or street changes", () => {
    for (const status of ["verified", "pending"] as const) {
      const { changes, addressChanged } = accountChanges({ ...VERIFIED, residency_status: status }, input({ barangay: "Bel-Air" }));
      expect(addressChanged).toBe(true);
      expect(changes).toMatchObject({ residency_status: "pending", residency_note: null, residency_reviewed_by: null, residency_reviewed_at: null });
    }
    expect(accountChanges(VERIFIED, input({ address_line: "34 Other Street" })).changes.residency_status).toBe("pending");
  });

  it("asks an account with no proof on file for one: pending without a file is the upload step", async () => {
    const { residencyLocked } = await import("../../src/server/lib/residency.js");
    const status = accountChanges(VERIFIED, input({ barangay: "Bel-Air" })).changes.residency_status as string;
    expect(residencyLocked({ role: "citizen", residency_status: status, has_residency_proof: true })).toBe(false);
    expect(residencyLocked({ role: "citizen", residency_status: status, has_residency_proof: false })).toBe(true);
  });

  it("leaves a rejected or missing proof as it is: the citizen still has to send one", () => {
    expect(accountChanges({ ...VERIFIED, residency_status: "rejected" }, input({ barangay: "Bel-Air" })).changes).not.toHaveProperty("residency_status");
    expect(accountChanges({ ...VERIFIED, residency_status: null }, input({ barangay: "Bel-Air" })).changes).not.toHaveProperty("residency_status");
  });
});

describe("UA-13 the account form's rules match registration", () => {
  it("accepts a full set of details", () => {
    expect(accountUpdateSchema.safeParse({ first_name: "Ana", last_name: "Reyes", barangay: "Poblacion", address_line: "12 Sample Street" }).success).toBe(true);
  });

  it("refuses a barangay outside Makati, an initial for a middle name, a bad number, and a short street", () => {
    expect(accountUpdateSchema.safeParse({ first_name: "Ana", last_name: "Reyes", barangay: "Pembo", address_line: "12 Sample Street" }).success).toBe(false);
    expect(accountUpdateSchema.safeParse({ first_name: "Ana", middle_name: "S.", last_name: "Reyes", barangay: "Poblacion", address_line: "12 Sample Street" }).success).toBe(false);
    expect(accountUpdateSchema.safeParse({ first_name: "Ana", last_name: "Reyes", contact_number: "12345", barangay: "Poblacion", address_line: "12 Sample Street" }).success).toBe(false);
    expect(accountUpdateSchema.safeParse({ first_name: "Ana", last_name: "Reyes", barangay: "Poblacion", address_line: "12" }).success).toBe(false);
  });

  it("does not take an email address: changing it needs a new code", () => {
    const parsed = accountUpdateSchema.parse({ first_name: "Ana", last_name: "Reyes", barangay: "Poblacion", address_line: "12 Sample Street", email: "new@example.com" });
    expect(parsed).not.toHaveProperty("email");
  });
});

describe("KI-20 PDF text the built-in font can print", () => {
  it("keeps plain text, Filipino and Spanish letters, and typographic marks", () => {
    expect(pdfText("Dasmariñas — “Bel-Air” … ok")).toBe("Dasmariñas — “Bel-Air” … ok");
  });

  it("turns arrows and the peso sign into ASCII", () => {
    expect(pdfText("Pending → Under review")).toBe("Pending -> Under review");
    expect(pdfText("₱500")).toBe("PHP 500");
  });

  it("drops emoji and marks anything else unprintable with ?", () => {
    expect(pdfText("Pothole 🚧 fixed ✅")).toBe("Pothole  fixed ");
    expect(pdfText("路 road")).toBe("? road");
  });
});
