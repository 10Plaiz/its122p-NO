import { Router } from "express";
import { z } from "zod";
import { auth, db } from "../config/supabase.js";
import { accountError } from "../lib/accounts-errors.js";
import {
  confirmEmail,
  refreshSession,
  resendSignUpCode,
  resetPassword,
  sendPasswordResetCode,
  startSignUp,
} from "../lib/accounts-email.js";
import { ACCOUNT_FIELDS, revokeSession, sessionResponse, withProofFlag } from "../lib/accounts-profile.js";
import { badRequest, orThrow } from "../lib/errors.js";
import { checkProof, removeProof, residencyUpload, saveProof } from "../lib/residency.js";
import { limits } from "../lib/rate-limit.js";
import {
  addressLine,
  barangay,
  contactNumber,
  nameParts,
  optional,
  parse,
  passwordRule,
  verificationCode,
} from "../lib/validate.js";
import { bearerToken, currentUser, requireAuth, requireRole } from "../middleware/auth.js";
import { logActivity } from "../lib/activity.js";

const router = Router();

export const PRIVACY_CONSENT_ERROR = "Agree to the privacy notice to create an account.";

const email = z.email("Enter a valid email address.").max(254, "That email address is too long.");

// UA-7: the name in parts, and where in Makati the registrant lives. The address is
// personal data under the Data Privacy Act (RA 10173), so registering needs consent.
export const registerSchema = z.object({
  ...nameParts,
  email,
  password: passwordRule,
  contact_number: optional(contactNumber),
  barangay,
  address_line: addressLine,
  privacy_consent: z.literal(true, PRIVACY_CONSENT_ERROR),
});

export const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export const emailSchema = z.object({ email });
export const verifyEmailSchema = z.object({ email, token: verificationCode });
export const resetPasswordSchema = z.object({ email, token: verificationCode, password: passwordRule });
export const refreshSchema = z.object({
  refresh_token: z.string().min(1, "Sign in again.").max(1024, "Sign in again."),
});

// Kept on the login as user_metadata. ensureProfile() builds the profile from it
// once the code is confirmed, re-checking every field and never reading a role,
// so anything registerSchema accepts must pass that re-check (ACC-11).
export function signUpMetadata(input: z.output<typeof registerSchema>, consentAt: string) {
  return {
    first_name: input.first_name,
    middle_name: input.middle_name ?? null,
    last_name: input.last_name,
    suffix: input.suffix ?? null,
    contact_number: input.contact_number ?? null,
    barangay: input.barangay,
    address_line: input.address_line,
    privacy_consent_at: consentAt,
  };
}

// Public sign-up always creates a citizen. Staff and admin accounts are made by
// an administrator through /api/admin/users, so nobody can grant themselves access.
//
// UA-5: this only starts the account. Supabase emails a 6-digit code, and the
// account is usable (and its profile created) once /verify-email accepts it.
router.post("/register", limits.register, async (req, res) => {
  const input = parse(registerSchema, req.body);

  const result = await startSignUp({
    email: input.email,
    password: input.password,
    metadata: signUpMetadata(input, new Date().toISOString()),
  });

  res.status(201).json(result);
});

// A correct code confirms the address and signs the person in.
router.post("/verify-email", limits.verify, async (req, res) => {
  const input = parse(verifyEmailSchema, req.body);
  res.json(await confirmEmail(input.email, input.token));
});

// Same answer whether or not the address has an account waiting for a code.
router.post("/resend-code", limits.sendCode, async (req, res) => {
  const input = parse(emailSchema, req.body);
  await resendSignUpCode(input.email);
  res.status(204).end();
});

// UA-12. Same answer whether or not the address has an account.
router.post("/forgot-password", limits.sendCode, async (req, res) => {
  const input = parse(emailSchema, req.body);
  await sendPasswordResetCode(input.email);
  res.status(204).end();
});

router.post("/reset-password", limits.verify, async (req, res) => {
  const input = parse(resetPasswordSchema, req.body);
  await resetPassword(input.email, input.token, input.password);
  res.status(204).end();
});

// UA-9: trades a refresh token for a new session before the access token expires.
router.post("/refresh", limits.refresh, async (req, res) => {
  const input = parse(refreshSchema, req.body);
  res.json(await refreshSession(input.refresh_token));
});

// Wrong passwords are counted per address and per client (UA-10); a correct one
// is never slowed down by earlier typos.
router.post("/login", limits.loginPerClient, limits.loginPerAccount, async (req, res) => {
  const input = parse(loginSchema, req.body);

  const { data, error } = await auth.auth.signInWithPassword(input);
  if (error) throw accountError(error, "That email and password do not match.");

  res.json(await sessionResponse(data.session, data.user));
});

// The whole account, as login returns it, so a reload sees the same residency
// status and rejection note as a fresh sign-in.
router.get("/me", requireAuth, async (req, res) => {
  const profile = orThrow(
    await db.from("profiles").select(`${ACCOUNT_FIELDS}, residency_proof_path`).eq("id", currentUser(req).id).single(),
    "Your account could not be loaded.",
  );
  res.json({ user: withProofFlag(profile as unknown as { residency_proof_path: string | null }) });
});

export const ALREADY_VERIFIED_ERROR = "Your residency is already confirmed. There is nothing more to upload.";

// UA-8. A signed-in citizen sends their proof of residency: right after confirming
// their email, again after a rejection, or as an existing citizen at the next
// sign-in. Signed in, because only then is it certain whose account the file
// belongs to. Each upload replaces the last and goes back to an administrator.
router.post(
  "/me/residency-proof",
  requireAuth,
  requireRole("citizen"),
  limits.proofUpload,
  residencyUpload,
  async (req, res) => {
    const user = currentUser(req);
    if (user.residency_status === "verified") throw badRequest(ALREADY_VERIFIED_ERROR);

    const extension = checkProof(req.file);
    const { data: before } = await db.from("profiles").select("residency_proof_path").eq("id", user.id).single();
    const path = await saveProof(user.id, req.file!, extension);

    const profile = orThrow(
      await db
        .from("profiles")
        .update({
          residency_proof_path: path,
          residency_status: "pending",
          residency_note: null,
          residency_reviewed_by: null,
          residency_reviewed_at: null,
        })
        .eq("id", user.id)
        .select(`${ACCOUNT_FIELDS}, residency_proof_path`)
        .single(),
      "Your proof was saved but your account could not be updated. Try again.",
    );

    // A JPG replaced by a PDF lands at a new path. The old file is personal data
    // nobody needs any more (RA 10173), so it goes, but only once the profile
    // points at the new one.
    const previous = (before as { residency_proof_path: string | null } | null)?.residency_proof_path;
    if (previous && previous !== path) await removeProof(previous);

    await logActivity(req, "residency.uploaded", { entityType: "user", entityId: user.id });
    res.json({ user: withProofFlag(profile as unknown as { residency_proof_path: string | null }) });
  },
);

// Ends this session on the server too, so a copied token stops working (UA-10).
router.post("/logout", requireAuth, async (req, res) => {
  const token = bearerToken(req);
  if (token) await revokeSession(token);
  await logActivity(req, "auth.logout");
  res.status(204).end();
});

export default router;
