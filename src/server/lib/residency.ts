import multer from "multer";
import { db } from "../config/supabase.js";
import { ApiError, badRequest, orThrow } from "./errors.js";
import type { Express, NextFunction, Request, Response } from "express";

// Proof of residency for UA-8: one document a registrant uploads so an
// administrator can confirm they live in Makati. It holds an address and often an
// ID number, so it goes to a PRIVATE bucket (created by the accounts migration)
// and is only ever read through a short-lived signed URL an administrator asks for.

export const RESIDENCY_BUCKET = "residency-proofs";
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const PROOF_FIELD = "proof";
// How long an administrator's link to a proof stays usable.
export const PROOF_URL_SECONDS = 300;

export const PROOF_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
} as const;
export type ProofExtension = (typeof PROOF_TYPES)[keyof typeof PROOF_TYPES];

export const PROOF_TYPE_ERROR = "Upload a JPG, PNG, WebP, or PDF file.";
export const PROOF_SIZE_ERROR = "Keep the file under 5 MB.";
export const PROOF_MISSING_ERROR = "Upload a proof of residency, such as a utility bill or barangay certificate.";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PROOF_MAX_BYTES, files: 1 },
  fileFilter(_req, file, cb) {
    if (!(file.mimetype in PROOF_TYPES)) return cb(new ApiError(400, PROOF_TYPE_ERROR));
    cb(null, true);
  },
});

function proofFieldError(message: string) {
  return badRequest("Some fields are invalid. Fix them and try again.", [{ field: PROOF_FIELD, message }]);
}

// multer's own errors would reach the shared handler as "That file could not be
// uploaded." with no field attached; these become a field error on the upload
// control instead, so the form marks the input that was wrong.
export function residencyUpload(req: Request, res: Response, next: NextFunction) {
  upload.single(PROOF_FIELD)(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") return next(proofFieldError(PROOF_SIZE_ERROR));
    if (error instanceof ApiError) return next(proofFieldError(error.message));
    next(proofFieldError("That file could not be uploaded. Try a different file."));
  });
}

// The browser supplies the MIME type, so a renamed executable would pass on that
// alone. The first bytes of each allowed format are fixed, and checking them costs
// nothing.
export function looksLike(buffer: Buffer, mimetype: string): boolean {
  const starts = (bytes: number[], offset = 0) => bytes.every((byte, index) => buffer[offset + index] === byte);
  switch (mimetype) {
    case "image/jpeg":
      return starts([0xff, 0xd8, 0xff]);
    case "image/png":
      return starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8);
    case "application/pdf":
      return starts([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
    default:
      return false;
  }
}

// Throws the same field error the form shows when the upload is missing or is
// not what it claims to be. Returns the extension to store it under.
export function checkProof(file: Express.Multer.File | undefined): ProofExtension {
  if (!file) throw proofFieldError(PROOF_MISSING_ERROR);
  const extension = PROOF_TYPES[file.mimetype as keyof typeof PROOF_TYPES];
  if (!extension || !looksLike(file.buffer, file.mimetype)) throw proofFieldError(PROOF_TYPE_ERROR);
  return extension;
}

// One file per account, named by the account, so a repeated registration for the
// same unconfirmed address replaces its own proof rather than piling up copies,
// and a path can always be rebuilt from the user id and extension.
export function proofPath(userId: string, extension: ProofExtension) {
  return `${userId}/residency-proof.${extension}`;
}

export async function saveProof(userId: string, file: Express.Multer.File, extension: ProofExtension) {
  const path = proofPath(userId, extension);
  const result = await db.storage
    .from(RESIDENCY_BUCKET)
    .upload(path, file.buffer, { contentType: file.mimetype, upsert: true });
  orThrow(result, "Your proof of residency could not be saved.");
  return path;
}

export async function signedProofUrl(path: string) {
  const result = await db.storage.from(RESIDENCY_BUCKET).createSignedUrl(path, PROOF_URL_SECONDS);
  return orThrow(result, "The proof of residency could not be opened.").signedUrl;
}

// For the reviewer's preview: an image can be shown inline, a PDF only linked.
export function proofKind(path: string): "image" | "pdf" {
  return path.endsWith(".pdf") ? "pdf" : "image";
}

export async function removeProof(path: string) {
  const { error } = await db.storage.from(RESIDENCY_BUCKET).remove([path]);
  if (error) console.error("Could not remove a replaced residency proof:", error.message);
}

// UA-8: where a citizen stands, from the two facts that decide it. A citizen with
// no proof, or whose proof was rejected, is locked to the upload step until they
// send one (decided 2026-10-03). Verified comes first: an administrator may confirm
// an existing citizen without any upload. Staff and admins are never residents
// being checked. Mirrored by residencyStep in src/web/lib/residency.ts.
export type ResidencyStep = "upload" | "rejected" | "pending" | "verified";

export type ResidencyFacts = {
  role: string;
  residency_status?: string | null;
  has_residency_proof?: boolean;
};

export function residencyStep({ role, residency_status, has_residency_proof }: ResidencyFacts): ResidencyStep {
  if (role !== "citizen" || residency_status === "verified") return "verified";
  if (residency_status === "rejected") return "rejected";
  return has_residency_proof ? "pending" : "upload";
}

export function residencyLocked(facts: ResidencyFacts) {
  const step = residencyStep(facts);
  return step === "upload" || step === "rejected";
}
