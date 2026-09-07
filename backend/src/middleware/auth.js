import { db } from "../config/supabase.js";
import { forbidden, unauthorized } from "../lib/errors.js";

// Verifies the Supabase access token in the Authorization header and attaches
// the caller's profile as req.user = { id, name, email, role }.
export async function requireAuth(req, _res, next) {
  const header = req.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(unauthorized("Sign in to continue."));

  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return next(unauthorized("Your session has expired. Sign in again."));

  const { data: profile } = await db
    .from("profiles")
    .select("id, name, email, role, is_active")
    .eq("id", data.user.id)
    .single();

  if (!profile) return next(unauthorized("Your account no longer exists."));
  if (!profile.is_active) return next(forbidden("Your account has been deactivated. Contact an administrator."));

  req.user = profile;
  next();
}

// Use after requireAuth: requireRole("admin") or requireRole("admin", "staff").
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(forbidden("This action is limited to: " + roles.join(", ") + "."));
    }
    next();
  };
}
