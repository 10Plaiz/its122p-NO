import { ApiError } from "./errors.js";

// Supabase Auth answers in its own vocabulary ("invalid_credentials",
// "over_email_send_rate_limit"). This turns the codes a person can actually run
// into on these screens into a plain sentence and a status, so a failed sign-in
// or registration says what happened and what to do next instead of "could not".
//
// `code` travels in the error's details as { code } so a screen can switch to the
// right next step (the code entry, for an unconfirmed email) without matching
// on wording.

export const ACCOUNT_ERROR_CODES = {
  emailNotConfirmed: "email_not_confirmed",
  alreadyRegistered: "already_registered",
  // UA-8: a citizen without an accepted proof of residency. The web app sends
  // them to the upload step.
  residencyRequired: "residency_required",
} as const;

type AuthFailure = { code?: string | null; message?: string; status?: number } | null | undefined;

const MESSAGES: Record<string, { status: number; message: string; code?: string }> = {
  invalid_credentials: { status: 401, message: "That email and password do not match." },
  email_not_confirmed: {
    status: 403,
    message: "Confirm your email address first. Enter the 6-digit code we sent you.",
    code: ACCOUNT_ERROR_CODES.emailNotConfirmed,
  },
  user_already_exists: {
    status: 409,
    message: "An account with that email already exists. Sign in instead.",
    code: ACCOUNT_ERROR_CODES.alreadyRegistered,
  },
  email_exists: {
    status: 409,
    message: "An account with that email already exists. Sign in instead.",
    code: ACCOUNT_ERROR_CODES.alreadyRegistered,
  },
  phone_exists: { status: 409, message: "That mobile number is already used by another account." },
  weak_password: {
    status: 400,
    message: "That password is too weak. Use at least 8 characters with a letter, a number, and a special character.",
  },
  same_password: { status: 400, message: "Choose a password different from your current one." },
  otp_expired: { status: 400, message: "That code is wrong or has expired. Check it, or send a new code." },
  otp_disabled: { status: 400, message: "Code sign-in is turned off for this site." },
  over_request_rate_limit: { status: 429, message: "Too many attempts. Wait a few minutes, then try again." },
  over_email_send_rate_limit: {
    status: 429,
    message: "Too many emails were sent to this address. Wait a few minutes before asking for another code.",
  },
  over_sms_send_rate_limit: {
    status: 429,
    message: "Too many text messages were sent to this number. Wait a few minutes before asking for another code.",
  },
  user_banned: { status: 403, message: "Your account has been deactivated. Contact an administrator." },
  signup_disabled: { status: 403, message: "New registrations are closed right now." },
  email_address_invalid: { status: 400, message: "That email address cannot receive mail. Use a different one." },
  phone_provider_disabled: {
    status: 503,
    message: "Text-message codes are not available right now. An administrator can confirm your number instead.",
  },
  sms_send_failed: {
    status: 503,
    message: "The text message could not be sent. Try again later, or ask an administrator to confirm your number.",
  },
  hook_timeout: {
    status: 503,
    message: "The text message could not be sent. Try again later, or ask an administrator to confirm your number.",
  },
  session_not_found: { status: 401, message: "Your session has expired. Sign in again." },
  refresh_token_not_found: { status: 401, message: "Your session has expired. Sign in again." },
  refresh_token_already_used: { status: 401, message: "Your session has expired. Sign in again." },
};

// `fallback` is the route's own sentence for anything not listed above, sent with
// `fallbackStatus` (refresh uses 401 so any failure ends the session). The raw
// Supabase message is kept in the details for the developer console, never shown.
export function accountError(failure: AuthFailure, fallback: string, fallbackStatus = 400): ApiError {
  const known = failure?.code ? MESSAGES[failure.code] : undefined;
  if (known) return new ApiError(known.status, known.message, known.code ? { code: known.code } : undefined);

  // Supabase's own throttle sometimes arrives as a bare 429 with no code.
  if (failure?.status === 429) return new ApiError(429, MESSAGES.over_request_rate_limit!.message);

  return new ApiError(fallbackStatus, fallback, failure?.message);
}
