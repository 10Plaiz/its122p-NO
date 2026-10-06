import { z } from "zod";
import { db } from "../config/supabase.js";
import { ApiError, forbidden, orThrow, unauthorized } from "./errors.js";
import { BARANGAYS, SUFFIXES, composeName } from "./validate.js";
import type { Session, User } from "@supabase/supabase-js";

export const accountProfileSchema = z.object({
  id: z.uuid(), name: z.string(), email: z.string(), role: z.enum(["admin", "staff", "citizen"]),
  first_name: z.string().nullable(), middle_name: z.string().nullable(), last_name: z.string().nullable(),
  suffix: z.string().nullable(), contact_number: z.string().nullable(), phone_verified_at: z.string().nullable(),
  barangay: z.string().nullable(), address_line: z.string().nullable(),
  residency_status: z.enum(["pending", "verified", "rejected"]).nullable(), residency_note: z.string().nullable(),
  is_active: z.boolean(), has_residency_proof: z.boolean(),
  residency_review_version: z.uuid(), residency_proof_id: z.uuid().nullable(),
});

// The columns a signed-in person gets back about themselves. residency_note is the
// administrator's reason when a proof is rejected, which the citizen must see to
// fix it. The proof's storage path is read (SESSION_FIELDS) only to derive
// has_residency_proof and never sent: only an administrator opens the file,
// through a signed URL.
export const ACCOUNT_FIELDS =
  "id, name, first_name, middle_name, last_name, suffix, email, role, contact_number, phone_verified_at, " +
  "barangay, address_line, residency_status, residency_note, is_active, residency_review_version, residency_proof_id";
const SESSION_FIELDS = `${ACCOUNT_FIELDS}, residency_proof_path`;

// What the users table shows an administrator. has_residency_proof is derived
// from residency_proof_path by withProofFlag below.
export const ADMIN_USER_FIELDS =
  `${ACCOUNT_FIELDS}, created_at, residency_proof_path, residency_reviewed_at, ` +
  // A profile pointing at another profile: PostgREST resolves this self-reference
  // by the column name and finds nothing by the constraint name (checked on a
  // local Supabase, 2026-10-03; the constraint-name form broke the users list).
  "reviewer:residency_reviewed_by ( id, name )";

export type AccountProfile = z.infer<typeof accountProfileSchema>;

// Swaps the proof's storage path for a yes/no, for every response that carries a
// profile.
export function withProofFlag<T extends { residency_proof_path?: string | null }>(row: T) {
  const { residency_proof_path, ...rest } = row;
  return { ...rest, has_residency_proof: Boolean(residency_proof_path) };
}

// Registration details travel to Supabase as user_metadata as well as into the
// profile. If the profile insert ever fails after Supabase has created the login,
// the first successful code check rebuilds the profile from this copy, so an
// account can never be left signed up but unusable. Metadata is editable by its
// owner through Supabase directly, so every field is re-checked here and the role
// is never read from it: a rebuilt profile is always a citizen.
const recoverable = z.object({
  first_name: z.string().min(1).max(50),
  middle_name: z.string().max(50).nullish(),
  last_name: z.string().min(1).max(50),
  suffix: z.enum(SUFFIXES).nullish(),
  contact_number: z.string().regex(/^09\d{9}$/).nullish(),
  barangay: z.enum(BARANGAYS).nullish(),
  address_line: z.string().max(200).nullish(),
  privacy_consent_at: z.string().nullish(),
});

function toAccount(row: unknown) {
  return withProofFlag(row as { residency_proof_path?: string | null }) as unknown as AccountProfile;
}

async function findProfile(id: string) {
  const { data } = await db.from("profiles").select(SESSION_FIELDS).eq("id", id).maybeSingle();
  return data ? toAccount(data) : null;
}

export async function ensureProfile(user: User) {
  const existing = await findProfile(user.id);
  if (existing) return existing;

  const parsed = recoverable.safeParse(user.user_metadata ?? {});
  if (!parsed.success || !user.email) throw unauthorized("Your account no longer exists.");
  const meta = parsed.data;

  return toAccount(orThrow(
    await db
      .from("profiles")
      .insert({
        id: user.id,
        name: composeName(meta),
        first_name: meta.first_name,
        middle_name: meta.middle_name ?? null,
        last_name: meta.last_name,
        suffix: meta.suffix ?? null,
        email: user.email,
        contact_number: meta.contact_number ?? null,
        role: "citizen",
        barangay: meta.barangay ?? null,
        address_line: meta.address_line ?? null,
        privacy_consent_at: meta.privacy_consent_at ?? null,
        // No proof yet: the citizen uploads it signed in, right after this (UA-8).
        residency_status: "pending",
      })
      .select(SESSION_FIELDS)
      .single(),
    "Your account was confirmed but your profile could not be saved. Try signing in.",
  ));
}

// Ends one session server-side: its refresh token stops working, and Supabase
// refuses its access token once the session row is gone. `local` leaves the same
// person's other devices signed in. Failure is logged, never thrown: the caller
// is already on its way to refusing or ending the session anyway.
export async function revokeSession(accessToken: string) {
  const { error } = await db.auth.admin.signOut(accessToken, "local");
  if (error) console.error("Could not revoke a session:", error.message);
}

// The one response shape for every route that hands out a session: login, email
// code, and refresh. A deactivated account is refused here as well, so no route
// can issue a usable session to one.
export async function sessionResponse(session: Session | null, user: User | null) {
  if (!session || !user) throw new ApiError(401, "Your session could not be started. Sign in again.");

  const profile = await ensureProfile(user);
  if (!profile.is_active) {
    // Supabase has already issued the session; end it rather than leave a working
    // refresh token in a response nobody receives.
    await revokeSession(session.access_token);
    throw forbidden("Your account has been deactivated. Contact an administrator.");
  }

  return {
    user: profile,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
  };
}
