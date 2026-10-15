import multer from "multer";
import { randomUUID } from "node:crypto";
import { db, PHOTO_BUCKET } from "../config/supabase.js";
import { badRequest, orThrow } from "./errors.js";
import { looksLike } from "./residency.js";
import type { Express } from "express";

const ALLOWED = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const PHOTO_TYPE_ERROR = "Photos must be JPG, PNG, or WebP.";

// The browser supplies the MIME type, so the first bytes must agree with it, as
// for proofs. Called before the report row is written, so a bad file leaves
// nothing behind. Returns the storage extension.
export function checkPhoto(file: Express.Multer.File) {
  const extension = ALLOWED[file.mimetype as keyof typeof ALLOWED];
  if (!extension || !looksLike(file.buffer, file.mimetype)) throw badRequest(PHOTO_TYPE_ERROR);
  return extension;
}

// Photos are held in memory, checked here, then pushed to Supabase Storage —
// the proposal requires the backend to validate images before they are stored.
export const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, cb) {
    if (!(file.mimetype in ALLOWED)) {
      return cb(new Error(PHOTO_TYPE_ERROR));
    }
    cb(null, true);
  },
});

// Stores the file and records it against the report. Returns the row.
type PhotoInput = { file: Express.Multer.File; reportId: string | number; uploadedBy: string; kind: "initial" | "resolution" };
export async function savePhoto({ file, reportId, uploadedBy, kind }: PhotoInput) {
  const extension = checkPhoto(file);

  const path = `${reportId}/${kind}-${randomUUID()}.${extension}`;

  const upload = await db.storage
    .from(PHOTO_BUCKET)
    .upload(path, file.buffer, { contentType: file.mimetype });
  orThrow(upload, "The photo could not be saved.");

  return orThrow(
    await db
      .from("report_photos")
      .insert({ report_id: reportId, kind, storage_path: path, uploaded_by: uploadedBy })
      .select()
      .single(),
    "The photo was uploaded but could not be linked to the report.",
  );
}

// Turns a stored object key into a URL the frontend can render. Pass the row's
// purged_at as well and a photo whose file the retention purge removed gets null,
// so the page can say the photo is gone instead of showing a broken image.
export function photoUrl(storagePath: string): string;
export function photoUrl(storagePath: string, purgedAt: string | null | undefined): string | null;
export function photoUrl(storagePath: string, purgedAt?: string | null) {
  if (purgedAt) return null;
  return db.storage.from(PHOTO_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}
