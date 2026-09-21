import { Router } from "express";
import { z } from "zod";
import { auth, db } from "../config/supabase.js";
import { badRequest, forbidden, orThrow, unauthorized } from "../lib/errors.js";
import { contactNumber, parse, passwordRule } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { logActivity } from "../lib/activity.js";

const router = Router();

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(80, "Keep the name under 80 characters."),
  email: z.email("Enter a valid email address.").max(254, "That email address is too long."),
  password: passwordRule,
  contact_number: contactNumber.optional(),
});

export const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

// Public sign-up always creates a citizen. Staff and admin accounts are made by
// an administrator through /api/users, so nobody can grant themselves access.
router.post("/register", async (req, res) => {
  const input = parse(registerSchema, req.body);

  const { data, error } = await db.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });

  if (error) throw badRequest("That account could not be created.", error.message);

  const profile = orThrow(
    await db
      .from("profiles")
      .insert({
        id: data.user.id,
        name: input.name,
        email: input.email,
        contact_number: input.contact_number ?? null,
        role: "citizen",
      })
      .select("id, name, email, role, contact_number")
      .single(),
    "Your login was created but your profile could not be saved.",
  );

  res.status(201).json({ user: profile });
});

router.post("/login", async (req, res) => {
  const input = parse(loginSchema, req.body);

  const { data, error } = await auth.auth.signInWithPassword(input);
  if (error) throw unauthorized("That email and password do not match.");

  const { data: profile } = await db
    .from("profiles")
    .select("id, name, email, role, contact_number, is_active")
    .eq("id", data.user.id)
    .single();

  if (!profile) throw unauthorized("Your account no longer exists.");
  if (!profile.is_active) throw forbidden("Your account has been deactivated. Contact an administrator.");

  res.json({
    user: profile,
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
  });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post("/logout", requireAuth, async (req, res) => {
  await logActivity(req, "auth.logout");
  res.status(204).end();
});

export default router;
