// UA-4. Mirrored by passwordRule in src/server/lib/validate.ts, message for
// message. Letters and digits are ASCII to match Supabase's own `letters_digits`
// requirement; anything else (ñ, a space, !) counts as special.
export const PASSWORD_MAX = 72;
export const PASSWORD_MAX_ERROR = "Keep the password under 72 characters.";

export const PASSWORD_RULES = [
  { id: "length", label: "At least 8 characters", message: "Use at least 8 characters.", test: (value: string) => value.length >= 8 },
  { id: "letter", label: "A letter (A–Z)", message: "Include at least one letter (A–Z).", test: (value: string) => /[A-Za-z]/.test(value) },
  { id: "digit", label: "A number (0–9)", message: "Include at least one number (0–9).", test: (value: string) => /[0-9]/.test(value) },
  {
    id: "special",
    label: "A special character, such as ! or #",
    message: "Include at least one special character, such as ! or #.",
    test: (value: string) => /[^A-Za-z0-9]/.test(value),
  },
] as const;

// The first unmet rule, as the field's error. The checklist shows all of them.
export function validatePassword(value: string): string | undefined {
  if (value.length > PASSWORD_MAX) return PASSWORD_MAX_ERROR;
  return PASSWORD_RULES.find((rule) => !rule.test(value))?.message;
}
