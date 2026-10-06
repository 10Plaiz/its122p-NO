process.env.SUPABASE_URL ??= "https://placeholder.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "placeholder-publishable-key";
process.env.SUPABASE_SECRET_KEY ??= "placeholder-secret-key";

import { describe, expect, it } from "bun:test";

// Phase 2 C9: a citizen edits their own details (UA-13), and the PDF export's
// character clean-up (KI-20).

const { accountUpdateSchema } = await import("../../src/server/routes/auth.routes.js");
const { pdfText } = await import("../../src/web/lib/export.js");

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
