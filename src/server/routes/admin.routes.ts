import { Router } from "express";
import { z } from "zod";
import { db } from "../config/supabase.js";
import { accountError } from "../lib/accounts-errors.js";
import { ADMIN_USER_FIELDS, withProofFlag } from "../lib/accounts-profile.js";
import { ApiError, badRequest, notFound, orThrow } from "../lib/errors.js";
import { PROOF_URL_SECONDS, proofKind, signedProofUrl } from "../lib/residency.js";
import { composeName, contactNumber, nameParts, optional, parse, passwordRule } from "../lib/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { logActivity } from "../lib/activity.js";
import { currentUser } from "../middleware/auth.js";
import { ROLES } from "../types/auth.js";
import { calculateAnalytics, type AnalyticsReportRow } from "../lib/analytics.js";
import { adminAccount, changeAccount, createAccountProfile } from "../services/admin.accounts.js";
import { applyLogFilters, logFilterFields, logSelect } from "../lib/log-filters.js";

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
    expected_version: z.uuid("Refresh the review before deciding.").transform(value => value.toLowerCase()),
    note: z.string().trim().max(500, "Keep the reason under 500 characters.").optional(),
  })
  .refine((input) => input.decision !== "rejected" || (input.note?.length ?? 0) >= 5, {
    path: ["note"],
    message: RESIDENCY_NOTE_ERROR,
  });

export const phoneVerifiedSchema = z.object({ verified: z.boolean("Say whether the number is verified.") });

const userIdSchema = z.uuid("Send a valid user ID.").transform(value => value.toLowerCase());
const proofQuerySchema = z.object({
  expected_version: z.uuid("Refresh the review before opening its proof.").transform(value => value.toLowerCase()),
});

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

  const user = await createAccountProfile({
    actorId: currentUser(req).id, userId: data.user.id, ip: req.ip,
    input: {
        name: composeName(input),
        first_name: input.first_name,
        middle_name: input.middle_name ?? null,
        last_name: input.last_name,
        suffix: input.suffix ?? null,
        email: input.email,
        role: input.role,
        contact_number: input.contact_number ?? null,
    },
  });
  res.status(201).json({ user });
});

router.patch("/users/:id", async (req, res) => {
  const userId = parse(userIdSchema, req.params.id);
  const input = parse(updateUserSchema, req.body);

  // An admin who demotes or deactivates themselves would lock everyone out.
  if (req.params.id === currentUser(req).id && (input.role || input.is_active === false)) {
    throw badRequest("You cannot change your own role or deactivate your own account.");
  }

  const { first_name, middle_name, last_name, suffix, ...rest } = input;
  const changes: Record<string, unknown> = { ...rest };
  // A different number has not been verified by anyone (UA-6).
  // The transactional write clears phone verification when a number is supplied.
  if (first_name !== undefined && last_name !== undefined) {
    Object.assign(changes, {
      first_name,
      middle_name: middle_name ?? null,
      last_name,
      suffix: suffix ?? null,
      name: composeName({ first_name, middle_name, last_name, suffix }),
    });
  }

  const user = await changeAccount({ actorId: currentUser(req).id, userId,
    action: "user.updated", input: changes, ip: req.ip });
  res.json({ user });
});

async function findUser(id: string) {
  const { data, error } = await db.from("profiles").select(ADMIN_USER_FIELDS).eq("id", id).maybeSingle();
  if (error) throw new ApiError(500, "That user could not be loaded.");
  if (!data) throw notFound("That user does not exist.");
  return adminAccount.omit({ has_residency_proof: true }).extend({ residency_proof_path: z.string().nullable() }).parse(data);
}

router.get("/users/:id", async (req, res) => {
  const user = await findUser(parse(userIdSchema, req.params.id));
  res.json({ user: withProofFlag(user) });
});

// UA-8. The proof holds an address and often an ID number, so the link lasts five
// minutes and every opening is logged.
router.get("/users/:id/residency-proof", async (req, res) => {
  const userId = parse(userIdSchema, req.params.id);
  const { expected_version } = parse(proofQuerySchema, req.query);
  const user = await findUser(userId);
  if (user.residency_review_version !== expected_version) {
    throw new ApiError(409, "This residency review has changed. Refresh the review before continuing.");
  }
  if (!user.residency_proof_path) throw notFound("This account has not uploaded a proof of residency.");
  if (!user.residency_proof_id) throw new ApiError(500, "This proof has no review identity. Refresh the review.");

  const url = await signedProofUrl(user.residency_proof_path);
  await logActivity(req, "residency.proof_viewed", {
    entityType: "user", entityId: user.id, required: true,
    metadata: { residency_proof_id: user.residency_proof_id, residency_review_version: user.residency_review_version },
  });
  res.json({ url, kind: proofKind(user.residency_proof_path), expires_in: PROOF_URL_SECONDS,
    residency_proof_id: user.residency_proof_id, residency_review_version: user.residency_review_version });
});

// Accepting needs no upload (an administrator may know an existing citizen);
// rejecting does, because the citizen is then locked until they send a new one.
router.patch("/users/:id/residency", async (req, res) => {
  const input = parse(residencyReviewSchema, req.body);
  const userId = parse(userIdSchema, req.params.id);
  const updated = await changeAccount({ actorId: currentUser(req).id, userId,
    action: "residency.reviewed", input: { decision: input.decision, note: input.note ?? null,
      expected_version: input.expected_version }, ip: req.ip });
  res.json({ user: updated });
});

// UA-6 fallback while there is no SMS budget: an administrator who has confirmed
// a number by other means (a call, an ID) marks it verified.
router.patch("/users/:id/phone-verified", async (req, res) => {
  const { verified } = parse(phoneVerifiedSchema, req.body);
  const user = await findUser(parse(userIdSchema, req.params.id));
  if (verified && !user.contact_number) throw badRequest("This account has no mobile number to verify.");

  const updated = await changeAccount({ actorId: currentUser(req).id, userId: user.id,
    action: verified ? "user.phone_verified" : "user.phone_unverified", input: {}, ip: req.ip });
  res.json({ user: updated });
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

// GET /api/admin/logs — filtered on the server (B9) by action, actor role, report
// reference, and date, so every page and the export see the same rows.
export const logQuerySchema = z.object({
  ...logFilterFields,
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(50),
});

router.get("/logs", async (req, res) => {
  const { page, per_page, ...filters } = parse(logQuerySchema, req.query);

  const result = await applyLogFilters(
    db
      .from("activity_logs")
      .select(logSelect(filters), { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
    filters,
  ).range((page - 1) * per_page, page * per_page - 1);

  res.json({
    logs: orThrow(result, "Activity logs could not be loaded."),
    page,
    per_page,
    total: result.count ?? 0,
  });
});

export default router;
