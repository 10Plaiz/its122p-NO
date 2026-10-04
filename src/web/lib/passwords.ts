// UA-4. Mirrored by passwordRule in src/server/lib/validate.ts, message for
// message. Match Supabase's lowercase, uppercase, digit, and symbol requirements.
export const PASSWORD_MAX = 72;
export const PASSWORD_MAX_ERROR = "Keep the password under 72 characters.";

export const PASSWORD_RULES = [
  { id: "length", label: "At least 8 characters", message: "Use at least 8 characters.", test: (value: string) => value.length >= 8 },
  { id: "lowercase", label: "A lowercase letter (a-z)", message: "Include at least one lowercase letter (a-z).", test: (value: string) => /[a-z]/.test(value) },
  { id: "uppercase", label: "An uppercase letter (A-Z)", message: "Include at least one uppercase letter (A-Z).", test: (value: string) => /[A-Z]/.test(value) },
  { id: "digit", label: "A number (0–9)", message: "Include at least one number (0–9).", test: (value: string) => /[0-9]/.test(value) },
  {
    id: "special",
    label: "A special character, such as ! or #",
    message: "Include at least one special character, such as ! or #.",
    test: (value: string) => /[\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/.test(value),
  },
] as const;

// The first unmet rule, as the field's error. The checklist shows all of them.
export function validatePassword(value: string): string | undefined {
  if (value.length > PASSWORD_MAX) return PASSWORD_MAX_ERROR;
  return PASSWORD_RULES.find((rule) => !rule.test(value))?.message;
}
