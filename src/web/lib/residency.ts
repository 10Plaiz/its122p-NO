import type { Profile } from "./types.js";

// UA-8. Mirrors src/server/lib/residency.ts, rule for rule and message for
// message; tests/fast/residency.test.ts holds the two together.

export type ResidencyStep = "upload" | "rejected" | "pending" | "verified";

type ResidencyFacts = Pick<Profile, "role" | "residency_status" | "has_residency_proof">;

// A citizen with no proof, or a rejected one, is locked to the upload step
// (decided 2026-10-03). Verified comes first: an administrator may confirm an
// existing citizen without an upload. Staff and admins are never checked.
export function residencyStep({ role, residency_status, has_residency_proof }: ResidencyFacts): ResidencyStep {
  if (role !== "citizen" || residency_status === "verified") return "verified";
  if (residency_status === "rejected") return "rejected";
  return has_residency_proof ? "pending" : "upload";
}

export function residencyLocked(user: ResidencyFacts | null): boolean {
  if (!user) return false;
  const step = residencyStep(user);
  return step === "upload" || step === "rejected";
}

// Where a locked citizen is sent, and the only signed-in page they can use.
export const PROOF_STEP_PATH = "/register?step=proof";

// Matches ACCOUNT_ERROR_CODES.residencyRequired in src/server/lib/accounts-errors.ts.
export const RESIDENCY_REQUIRED = "residency_required";

export const PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const PROOF_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const PROOF_TYPE_ERROR = "Upload a JPG, PNG, WebP, or PDF file.";
export const PROOF_SIZE_ERROR = "Keep the file under 5 MB.";
export const PROOF_MISSING_ERROR = "Upload a proof of residency, such as a utility bill or barangay certificate.";

// The server also checks the file's first bytes; the browser only knows its type.
export function validateProof(file: File | null): string | undefined {
  if (!file) return PROOF_MISSING_ERROR;
  if (!(PROOF_TYPES as readonly string[]).includes(file.type)) return PROOF_TYPE_ERROR;
  if (file.size > PROOF_MAX_BYTES) return PROOF_SIZE_ERROR;
  return undefined;
}

export const RESIDENCY_LABEL: Record<ResidencyStep, string> = {
  upload: "No proof yet",
  rejected: "Proof rejected",
  pending: "Unverified resident",
  verified: "Verified resident",
};

// How a report's author appears to staff: anything short of verified is
// "Unverified resident" (decided 2026-10-03), except a proof that was rejected.
export function authorResidencyLabel(status: Profile["residency_status"]): string {
  if (status === "verified") return RESIDENCY_LABEL.verified;
  if (status === "rejected") return RESIDENCY_LABEL.rejected;
  return RESIDENCY_LABEL.pending;
}
