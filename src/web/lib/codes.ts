// UA-5, UA-12. Mirrors verificationCode in src/server/lib/validate.ts, message for
// message; tests/fast/account-codes.test.ts holds the two together.
export const CODE_LENGTH = 6;
export const CODE_ERROR = "Enter the 6-digit code.";

// Matches ACCOUNT_ERROR_CODES.emailNotConfirmed in src/server/lib/accounts-errors.ts.
export const EMAIL_NOT_CONFIRMED = "email_not_confirmed";

// Supabase will not send another code to the same address sooner than this
// (max_frequency), so the button waits too rather than fail.
export const RESEND_COOLDOWN_S = 60;

// Keeps digits only, so a code pasted as "123 456" or "123-456" still fits.
export function normalizeCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, CODE_LENGTH);
}

export function validateCode(value: string): string | undefined {
  return /^\d{6}$/.test(value.trim()) ? undefined : CODE_ERROR;
}

// Same pattern as the sign-in and register screens: catches a missing @ or dot;
// the server's z.email() has the final say.
export function validateEmail(value: string): string | undefined {
  if (!value.trim()) return "Enter your email address.";
  return /^\S+@\S+\.\S+$/.test(value.trim()) ? undefined : "Enter a valid email address.";
}
