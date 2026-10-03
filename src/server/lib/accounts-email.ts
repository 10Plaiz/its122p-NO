import { auth, db } from "../config/supabase.js";
import { accountError } from "./accounts-errors.js";
import { sessionResponse } from "./accounts-profile.js";
import { ApiError } from "./errors.js";

// UA-5, UA-9, UA-12: every account step that goes through a code Supabase emails,
// plus refresh. The routes in auth.routes.ts only parse and answer; the decisions
// live here so they can be tested with a stubbed client.
//
// Supabase behaviour these rely on (checked against supabase/auth's signup.go,
// verify.go and resend.go, 2026-10-03):
// - signUp on an address that is already confirmed returns no error, but a made-up
//   user with an empty `identities` list, so the address is not given away.
// - signUp on an address that exists but is unconfirmed resends the code and keeps
//   the first password and details: nobody can overwrite a pending account.
// - signUp with confirmations turned off returns a session straight away.
// - verifyOtp type 'signup' checks the confirmation code only. Type 'email' would
//   also accept a password-reset code, so it is not used here.
// - verifyOtp type 'recovery' confirms an unconfirmed address as well.
// - resend and resetPasswordForEmail answer the same whether or not the address
//   has an account.

export const VERIFICATION_OFF_ERROR =
  "New accounts cannot be created right now because email verification is not set up. Contact an administrator.";

export type SignUpDetails = {
  email: string;
  password: string;
  // Stored on the login as user_metadata. The profile row is built from it by
  // ensureProfile() when the code is confirmed, not before, so an address nobody
  // confirms never gets a profile.
  metadata: Record<string, unknown>;
};

export async function startSignUp({ email, password, metadata }: SignUpDetails) {
  const { data, error } = await auth.auth.signUp({ email, password, options: { data: metadata } });
  if (error) throw accountError(error, "That account could not be created. Check the details and try again.");

  // Already registered and confirmed: Supabase hides it behind a made-up user.
  if (!data.user || data.user.identities?.length === 0) {
    throw accountError({ code: "user_already_exists" }, "");
  }

  // Confirmations are off on this Supabase project, so it confirmed the address
  // without any check. Nobody gets an unverified account: remove the login that
  // was just made and say what is wrong. Only a new login can come back with a
  // session here; an existing one fails with user_already_exists above.
  if (data.session) {
    const { error: removeError } = await db.auth.admin.deleteUser(data.user.id);
    if (removeError) console.error("Could not remove an unverified login:", removeError.message);
    console.error("Supabase email confirmations are off; turn on Confirm email for this project.");
    throw new ApiError(503, VERIFICATION_OFF_ERROR);
  }

  return { email };
}

// A correct code confirms the address and signs the person in. The profile is
// created on this first session (sessionResponse → ensureProfile).
export async function confirmEmail(email: string, token: string) {
  const { data, error } = await auth.auth.verifyOtp({ email, token, type: "signup" });
  if (error) throw accountError(error, "That code could not be checked. Send a new code and try again.");
  return sessionResponse(data.session, data.user);
}

export async function resendSignUpCode(email: string) {
  const { error } = await auth.auth.resend({ type: "signup", email });
  if (error) throw accountError(error, "A new code could not be sent. Try again in a few minutes.");
}

export async function sendPasswordResetCode(email: string) {
  const { error } = await auth.auth.resetPasswordForEmail(email);
  if (error) throw accountError(error, "A reset code could not be sent. Try again in a few minutes.");
}

// UA-12. The code proves the person reads the address's mail. The new password is
// set with the secret key, then every session on the account is ended, including
// the one the code just opened: whoever knew the old password is signed out
// everywhere, and the person signs in again with the new one.
export async function resetPassword(email: string, token: string, password: string) {
  const { data, error } = await auth.auth.verifyOtp({ email, token, type: "recovery" });
  if (error) throw accountError(error, "That code could not be checked. Send a new code and try again.");
  if (!data.user || !data.session) throw new ApiError(400, "That code could not be checked. Send a new code and try again.");

  const { error: updateError } = await db.auth.admin.updateUserById(data.user.id, { password });
  if (updateError) {
    // verifyOtp above used the code up, so trying again with it cannot work (KI-16).
    const refused = accountError(updateError, "Your password could not be changed.");
    throw new ApiError(
      refused.status,
      `${refused.message} That code is now used up: ask for a new code, then choose the password again.`,
      { ...((refused.details as object | undefined) ?? {}), code_used: true },
    );
  }

  const { error: signOutError } = await db.auth.admin.signOut(data.session.access_token, "global");
  if (signOutError) console.error("Could not end sessions after a password reset:", signOutError.message);
}

// UA-9. A deactivated account is refused by sessionResponse, so an administrator
// deactivating someone ends their session at the next refresh at the latest.
export async function refreshSession(refreshToken: string) {
  const { data, error } = await auth.auth.refreshSession({ refresh_token: refreshToken });
  if (error) throw accountError(error, "Your session has expired. Sign in again.", 401);
  return sessionResponse(data.session, data.user);
}
