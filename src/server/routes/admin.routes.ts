import { Router } from "express";
import { z } from "zod";
import { db } from "../config/supabase.js";
import { accountError } from "../lib/accounts-errors.js";
import { ADMIN_USER_FIELDS, withProofFlag } from "../lib/accounts-profile.js";
import { badRequest, notFound, orThrow } from "../lib/errors.js";
import { PROOF_URL_SECONDS, proofKind, signedProofUrl } from "../lib/residency.js";
import { composeName, contactNumber, nameParts, optional, parse, passwordRule } from "../lib/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { logActivity } from "../lib/activity.js";
import { currentUser } from "../middleware/auth.js";
import { ROLES } from "../types/auth.js";
import { calculateAnalytics, type AnalyticsReportRow } from "../lib/analytics.js";

const router = Router();
router.use(requireAuth, requireRole("admin"));

export const createUserSchema = z.object({
  ...nameParts,
  email: z.email("Enter a valid email address.").max(254, "That email address is too long."),
  password: passwordRule,
  role: z.enum(ROLES, "Choose a role."),
  contact_number: optional(contactNumber),
});

// A name is changed as a whole: first and last together, with the middle name and
// suffix cleared when left out, so the composed display name never mixes old and
// new parts.
export const updateUserSchema = z
  .object({
    first_name: nameParts.first_name.optional(),
    middle_name: nameParts.middle_name,
    last_name: nameParts.last_name.optional(),
    suffix: nameParts.suffix,
    role: z.enum(ROLES).optional(),
    contact_number: optional(contactNumber),
    is_active: z.boolean().optional(),
  })
  .refine((input) => (input.first_name === undefined) === (input.last_name === undefined), {
    path: ["last_name"],
    message: "Send the first and last name together.",
  });

export const RESIDENCY_NOTE_ERROR = "Say why the proof was not accepted, so the citizen knows what to upload instead.";

// UA-8. Rejecting needs a reason the citizen will read on their upload screen.
export const residencyReviewSchema = z
  .object({
    decision: z.enum(["verified", "rejected"], "Choose whether to accept or reject the proof."),
    note: z.string().trim().max(500, "Keep the reason under 500 characters.").optional(),
  })
  .refine((input) => input.decision !== "rejected" || (input.note?.length ?? 0) >= 5, {
    path: ["note"],
    message: RESIDENCY_NOTE_ERROR,
  });

export const phoneVerifiedSchema = z.object({ verified: z.boolean("Say whether the number is verified.") });

// ---------------------------------------------------------------------- users

router.get("/users", async (req, res) => {
  const { role, residency } = parse(
    z.object({ role: z.enum(ROLES).optional(), residency: z.enum(["pending", "verified", "rejected"]).optional() }),
    req.query,
  );

  let query = db
    .from("profiles")
    .select(ADMIN_USER_FIELDS)
    .order("created_at", { ascending: false });

  if (role) query = query.eq("role", role);
  // UA-8: "pending" here means a proof is waiting for a decision, so citizens who
  // have not uploaded anything yet are left out.
  if (residency) query = query.eq("residency_status", residency);
  if (residency === "pending") query = query.not("residency_proof_path", "is", null);

  const users = orThrow(await query, "Users could not be loaded.") as unknown as { residency_proof_path?: string | null }[];
  res.json({ users: users.map(withProofFlag) });
});

// Staff and admin accounts exist only because an admin created them here.
router.post("/users", async (req, res) => {
  const input = parse(createUserSchema, req.body);

  const { data, error } = await db.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });
  if (error) throw accountError(error, "That account could not be created. Check the details and try again.");

  const user = orThrow(
    await db
      .from("profiles")
      .insert({
        id: data.user.id,
        name: composeName(input),
        first_name: input.first_name,
        middle_name: input.middle_name ?? null,
        last_name: input.last_name,
        suffix: input.suffix ?? null,
        email: input.email,
        role: input.role,
        contact_number: input.contact_number ?? null,
        // Residency is confirmed for citizens only; staff and admins are not residents being checked.
        residency_status: input.role === "citizen" ? "pending" : null,
      })
      .select(ADMIN_USER_FIELDS)
      .single(),
    "The login was created but the profile could not be saved.",
  );

  await logActivity(req, "user.created", { entityType: "user", entityId: data.user.id, metadata: { role: input.role } });
  res.status(201).json({ user: withProofFlag(user as unknown as { id: string; residency_proof_path?: string | null }) });
});

router.patch("/users/:id", async (req, res) => {
  const input = parse(updateUserSchema, req.body);

  // An admin who demotes or deactivates themselves would lock everyone out.
  if (req.params.id === currentUser(req).id && (input.role || input.is_active === false)) {
    throw badRequest("You cannot change your own role or deactivate your own account.");
  }

  const { first_name, middle_name, last_name, suffix, ...rest } = input;
  const changes: Record<string, unknown> = { ...rest };
  // A different number has not been verified by anyone (UA-6).
  if (input.contact_number !== undefined) changes.phone_verified_at = null;
  if (first_name !== undefined && last_name !== undefined) {
    Object.assign(changes, {
      first_name,
      middle_name: middle_name ?? null,
      last_name,
      suffix: suffix ?? null,
      name: composeName({ first_name, middle_name, last_name, suffix }),
    });
  }

  const { data: user } = await db
    .from("profiles")
    .update(changes)
    .eq("id", req.params.id)
    .select(ADMIN_USER_FIELDS)
    .single();

  if (!user) throw notFound("That user does not exist.");

  await logActivity(req, "user.updated", { entityType: "user", entityId: req.params.id, metadata: changes });
  res.json({ user: withProofFlag(user as unknown as { residency_proof_path?: string | null }) });
});

async function findUser(id: string) {
  const { data } = await db.from("profiles").select("id, role, contact_number, residency_proof_path").eq("id", id).maybeSingle();
  if (!data) throw notFound("That user does not exist.");
  return data as { id: string; role: string; contact_number: string | null; residency_proof_path: string | null };
}

// UA-8. The proof holds an address and often an ID number, so the link lasts five
// minutes and every opening is logged.
router.get("/users/:id/residency-proof", async (req, res) => {
  const user = await findUser(req.params.id);
  if (!user.residency_proof_path) throw notFound("This account has not uploaded a proof of residency.");

  const url = await signedProofUrl(user.residency_proof_path);
  await logActivity(req, "residency.proof_viewed", { entityType: "user", entityId: user.id });
  res.json({ url, kind: proofKind(user.residency_proof_path), expires_in: PROOF_URL_SECONDS });
});

// Accepting needs no upload (an administrator may know an existing citizen);
// rejecting does, because the citizen is then locked until they send a new one.
router.patch("/users/:id/residency", async (req, res) => {
  const input = parse(residencyReviewSchema, req.body);
  const user = await findUser(req.params.id);
  if (user.role !== "citizen") throw badRequest("Only citizens have a residency to confirm.");
  if (input.decision === "rejected" && !user.residency_proof_path) {
    throw badRequest("There is no proof to reject. This citizen has not uploaded one yet.");
  }

  const note = input.decision === "rejected" ? input.note! : null;
  const updated = orThrow(
    await db
      .from("profiles")
      .update({
        residency_status: input.decision,
        residency_note: note,
        residency_reviewed_by: currentUser(req).id,
        residency_reviewed_at: new Date().toISOString(),
      })
      .eq("id", user.id)
      .select(ADMIN_USER_FIELDS)
      .single(),
    "The review could not be saved.",
  );

  await logActivity(req, "residency.reviewed", {
    entityType: "user",
    entityId: user.id,
    metadata: { decision: input.decision, note },
  });

  // The citizen learns the outcome in the app. A failed notice must not undo a
  // saved review, so it is logged rather than thrown.
  const { error: noticeFailed } = await db.from("notifications").insert({
    user_id: user.id,
    message:
      input.decision === "verified"
        ? "Your proof of residency was accepted. Your reports no longer show “Unverified resident”."
        : `Your proof of residency was not accepted: ${note} Upload a new proof to continue using KAMOTI.`,
  });
  if (noticeFailed) console.error("Could not notify a citizen about their residency review:", noticeFailed.message);

  res.json({ user: withProofFlag(updated as unknown as { residency_proof_path?: string | null }) });
});

// UA-6 fallback while there is no SMS budget: an administrator who has confirmed
// a number by other means (a call, an ID) marks it verified.
router.patch("/users/:id/phone-verified", async (req, res) => {
  const { verified } = parse(phoneVerifiedSchema, req.body);
  const user = await findUser(req.params.id);
  if (verified && !user.contact_number) throw badRequest("This account has no mobile number to verify.");

  const updated = orThrow(
    await db
      .from("profiles")
      .update({ phone_verified_at: verified ? new Date().toISOString() : null })
      .eq("id", user.id)
      .select(ADMIN_USER_FIELDS)
      .single(),
    "The mobile number could not be updated.",
  );

  await logActivity(req, verified ? "user.phone_verified" : "user.phone_unverified", { entityType: "user", entityId: user.id });
  res.json({ user: withProofFlag(updated as unknown as { residency_proof_path?: string | null }) });
});

// ------------------------------------------------------------------ analytics

// Aggregated in JavaScript rather than SQL. At the volume this system handles
// that is fast enough, and it keeps the whole calculation visible in one place.
router.get("/analytics", async (_req, res) => {
  const reports = orThrow(
    await db.from("reports").select("status, submitted_at, resolved_at, category:categories ( name )"),
    "Analytics could not be loaded.",
  );

  res.json(calculateAnalytics(reports as AnalyticsReportRow[]));
});

// ----------------------------------------------------------------------- logs

router.get("/logs", async (req, res) => {
  const { page, per_page } = parse(
    z.object({
      page: z.coerce.number().int().min(1).default(1),
      per_page: z.coerce.number().int().min(1).max(100).default(50),
    }),
    req.query,
  );

  const result = await db
    .from("activity_logs")
    .select("id, action, entity_type, entity_id, metadata, created_at, actor:profiles ( id, name, role )", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range((page - 1) * per_page, page * per_page - 1);

  res.json({
    logs: orThrow(result, "Activity logs could not be loaded."),
    page,
    per_page,
    total: result.count ?? 0,
  });
});

export default router;
