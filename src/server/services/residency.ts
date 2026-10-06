import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "../config/supabase.js";
import { accountProfileSchema } from "../lib/accounts-profile.js";
import { ApiError } from "../lib/errors.js";
import { checkProof, proofPath, RESIDENCY_BUCKET } from "../lib/residency.js";
import { rpcData } from "../lib/rpc.js";

const proofRecord = z.object({
  id: z.uuid(), user_id: z.uuid(), object_path: z.string(), sha256: z.string().nullable(),
});

export async function completeResidencyProof({ userId, submissionId, expectedVersion, file, ip }: {
  userId: string; submissionId: string; expectedVersion: string; file: Express.Multer.File | undefined; ip?: string;
}) {
  const { file: proofFile, extension } = checkProof(file);
  const path = proofPath(userId, submissionId, extension);
  const sha256 = createHash("sha256").update(proofFile.buffer).digest("hex");
  const existing = await db.from("residency_proof_versions")
    .select("id, user_id, object_path, sha256").eq("id", submissionId).maybeSingle();
  if (existing.error) throw new ApiError(500, "Your earlier proof submission could not be checked. Try again.");

  if (existing.data) {
    const proof = proofRecord.parse(existing.data);
    if (proof.user_id !== userId || proof.object_path !== path || proof.sha256 !== sha256) {
      throw new ApiError(409, "This submission ID belongs to a different proof. Select the file again.");
    }
  } else {
    const bucket = db.storage.from(RESIDENCY_BUCKET);
    const upload = await bucket.upload(path, proofFile.buffer, { contentType: proofFile.mimetype, upsert: false });
    if (upload.error) {
      const stored = await bucket.download(path);
      if (stored.error || !stored.data) throw new ApiError(500, "Your proof of residency could not be saved. Try again.");
      const storedHash = createHash("sha256").update(Buffer.from(await stored.data.arrayBuffer())).digest("hex");
      if (storedHash !== sha256) {
        throw new ApiError(409, "This submission ID belongs to a different proof. Select the file again.");
      }
    }
  }

  // A failed acknowledgement can follow a committed attachment. Keep its object for an exact retry.
  return accountProfileSchema.parse(rpcData(await db.rpc("complete_residency_proof", {
    p_user_id: userId, p_submission_id: submissionId, p_object_path: path,
    p_sha256: sha256, p_expected_version: expectedVersion, p_ip: ip ?? null,
  }), "Your proof was saved but your account could not be updated. Retry with the same file."));
}

export async function updateOwnProfile({ userId, input, ip }: {
  userId: string; input: Record<string, unknown>; ip?: string;
}) {
  return accountProfileSchema.parse(rpcData(await db.rpc("update_own_profile", {
    p_user_id: userId, p_input: input, p_ip: ip ?? null,
  }), "Your details could not be saved. Try again."));
}
