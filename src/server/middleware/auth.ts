import { db } from "../config/supabase.js";
import { ACCOUNT_ERROR_CODES } from "../lib/accounts-errors.js";
import { ApiError, forbidden, unauthorized } from "../lib/errors.js";
import { residencyApproved, residencyLocked } from "../lib/residency.js";
import type { Request, Response, NextFunction } from "express";
import type { Role, AuthUser } from "../types/auth.js";

// Verifies the Supabase access token in the Authorization header and attaches
// the caller's profile as req.user = { id, name, email, role, residency facts }.
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = bearerToken(req);
  if (!token) return next(unauthorized("Sign in to continue."));

  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return next(unauthorized("Your session has expired. Sign in again."));

  const { data: profile } = await db
    .from("profiles")
    .select("id, name, email, role, is_active, residency_status, residency_proof_path, residency_review_version, residency_proof_id")
    .eq("id", data.user.id)
    .single();

  if (!profile) return next(unauthorized("Your account no longer exists."));
  if (!profile.is_active) return next(forbidden("Your account has been deactivated. Contact an administrator."));

  const { residency_proof_path, ...user } = profile;
  req.user = { ...user, has_residency_proof: Boolean(residency_proof_path) } as AuthUser;
  next();
}

export const RESIDENCY_REQUIRED_ERROR =
  "Upload your proof of residency to continue. Your account opens again once it is sent; reporting opens once an administrator approves it.";

// UA-8, after requireAuth. A citizen with no proof, or a rejected one, can reach
// nothing behind this until they upload (decided 2026-10-03: strict lock). The
// upload itself, /auth/me and sign-out are not behind it.
export function requireResidency(req: Request, _res: Response, next: NextFunction) {
  if (req.user && residencyLocked(req.user)) {
    return next(new ApiError(403, RESIDENCY_REQUIRED_ERROR, { code: ACCOUNT_ERROR_CODES.residencyRequired }));
  }
  next();
}

export const RESIDENCY_PENDING_ERROR =
  "An administrator is still reviewing your proof of residency. You can file reports and add photos once it is approved.";

// Issue #59, after requireResidency. New reports and report photos wait for an
// administrator's approval, not just an uploaded proof. req.user is read fresh
// from profiles on every request, so a session opened before an address change or
// a review sees the current status.
export function assertResidencyApproved(req: Request) {
  if (req.user && !residencyApproved(req.user)) {
    throw new ApiError(403, RESIDENCY_PENDING_ERROR, { code: ACCOUNT_ERROR_CODES.residencyPending });
  }
}

export function requireApprovedResidency(req: Request, _res: Response, next: NextFunction) {
  try {
    assertResidencyApproved(req);
    next();
  } catch (error) {
    next(error);
  }
}

// The caller's own Supabase access token. Routes that act on Supabase Auth as the
// caller (sign-out, phone change) need the token itself, not just the profile.
export function bearerToken(req: Request): string | null {
  const header = req.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

// Use after requireAuth: requireRole("admin") or requireRole("admin", "staff").
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(forbidden("This action is limited to: " + roles.join(", ") + "."));
    }
    next();
  };
}
