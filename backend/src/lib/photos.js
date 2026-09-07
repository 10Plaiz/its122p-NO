import multer from "multer";
import { randomUUID } from "node:crypto";
import { db, PHOTO_BUCKET } from "../config/supabase.js";
import { badRequest, orThrow } from "./errors.js";

const ALLOWED = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Photos are held in memory, checked here, then pushed to Supabase Storage —
// the proposal requires the backend to validate images before they are stored.
export const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, cb) {
    if (!ALLOWED[file.mimetype]) {
      return cb(new Error("Photos must be JPG, PNG, or WebP."));
    }
    cb(null, true);
  },
});

// Stores the file and records it against the report. Returns the row.
export async function savePhoto({ file, reportId, uploadedBy, kind }) {
  const extension = ALLOWED[file.mimetype];
  if (!extension) throw badRequest("Photos must be JPG, PNG, or WebP.");

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

// Turns a stored object key into a URL the frontend can render.
export function photoUrl(storagePath) {
  return db.storage.from(PHOTO_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}
