import { isIP } from "node:net";
import { ipKeyGenerator } from "express-rate-limit";
import type { RequestHandler } from "express";
import { z } from "zod";
import { db } from "../config/supabase.js";
import { currentUser } from "../middleware/auth.js";
import { ApiError, badRequest } from "./errors.js";

type CitizenOperation = "report.create" | "report.photo" | "residency.proof";
type AdmissionAction = "report.create.json" | "report.create.multipart" | "report.photo" | "residency.proof";
type TransportPolicy<Operation extends CitizenOperation> = Operation extends "report.create"
  ? { kind: "create"; jsonAction: "report.create.json"; multipartAction: "report.create.multipart" }
  : { kind: "upload"; action: Extract<AdmissionAction, Operation> };

const operationRegistry = {
  "report.create": { kind: "create", jsonAction: "report.create.json", multipartAction: "report.create.multipart" },
  "report.photo": { kind: "upload", action: "report.photo" },
  "residency.proof": { kind: "upload", action: "residency.proof" },
} satisfies { [Operation in CitizenOperation]: TransportPolicy<Operation> };

const actorIdSchema = z.uuid().brand<"CitizenId">();
const networkKeySchema = z.string().min(1).max(128).brand<"NetworkKey">();
const proofSubmissionIdSchema = z.uuid().transform(value => value.toLowerCase());
const admissionResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("allowed") }).strict(),
  z.object({
    kind: z.literal("limited"),
    operation: z.enum(["report", "photo", "proof"]),
    retry_after_seconds: z.number().int().positive().max(3600),
    retry_at: z.iso.datetime({ offset: true }),
  }).strict(),
]);

function unavailable() {
  return new ApiError(503, "Submission checks are temporarily unavailable. Try again in a minute.", {
    code: "citizen_submission_unavailable",
    retry_after_seconds: 60,
    retry_at: new Date(Date.now() + 60_000).toISOString(),
  }, 60);
}

const operationLabels = { report: "reports", photo: "report photos", proof: "proofs of residency" };

function normalizedNetworkKey(ip: string) {
  if (isIP(ip) === 4) return ipKeyGenerator(ip);
  const canonical = new URL(`http://[${ip}]`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(canonical);
  if (mapped) {
    const high = parseInt(mapped[1], 16);
    const low = parseInt(mapped[2], 16);
    return ipKeyGenerator(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  return ipKeyGenerator(canonical);
}

export function citizenSubmissionLimit(operation: CitizenOperation): RequestHandler {
  return async (req, _res, next) => {
    const user = currentUser(req);
    if (user.role !== "citizen") return next();

    const policy = operationRegistry[operation];
    let action: AdmissionAction;
    if (policy.kind === "create") {
      if (req.is("application/json")) action = policy.jsonAction;
      else if (req.is("multipart/form-data")) action = policy.multipartAction;
      else throw badRequest("Send this report as JSON or multipart form data.");
    } else {
      action = policy.action;
    }

    const rawIp = process.env.VERCEL === "1" ? req.ip : req.socket.remoteAddress;
    const actorId = actorIdSchema.safeParse(user.id);
    if (!rawIp || !isIP(rawIp) || !actorId.success) throw unavailable();
    let networkKey;
    try {
      networkKey = networkKeySchema.safeParse(normalizedNetworkKey(rawIp));
    } catch {
      throw unavailable();
    }
    if (!networkKey.success) throw unavailable();

    let submissionId: string | undefined;
    if (operation === "residency.proof" && req.query.submission_id !== undefined) {
      const parsed = proofSubmissionIdSchema.safeParse(req.query.submission_id);
      if (!parsed.success) throw badRequest("Send a valid proof submission ID.");
      submissionId = parsed.data;
    }

    let response;
    try {
      response = await db.rpc("admit_citizen_operation", {
        p_actor_id: actorId.data,
        p_network_key: networkKey.data,
        p_action: action,
        ...(submissionId ? { p_submission_id: submissionId } : {}),
      }).retry(false).abortSignal(AbortSignal.timeout(5000));
    } catch {
      throw unavailable();
    }

    if (response.error) {
      if (response.error.code === "PT400") throw badRequest("Your residency is already confirmed. There is nothing more to upload.");
      if (response.error.code === "PT403") throw new ApiError(403, "Your account cannot submit this request. Reload your account and try again.");
      throw unavailable();
    }
    const result = admissionResultSchema.safeParse(response.data);
    if (!result.success) throw unavailable();
    if (result.data.kind === "allowed") return next();

    const { operation: metric, retry_after_seconds, retry_at } = result.data;
    const minutes = Math.ceil(retry_after_seconds / 60);
    throw new ApiError(429, `Too many ${operationLabels[metric]} were attempted recently. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`, {
      code: "citizen_submission_limited", operation: metric, retry_after_seconds, retry_at,
    }, retry_after_seconds);
  };
}
