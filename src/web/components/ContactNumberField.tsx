import { useState } from "react";
import type { ChangeEvent } from "react";
import { Field, Input, fieldNoteId } from "./ui.js";

// A Philippine mobile number: exactly eleven digits beginning 09. Mirrored by
// `contactNumber` in src/server/lib/validate.ts, message for message, so the field
// never says one thing here and another after submitting.
export const CONTACT_PATTERN = /^09\d{9}$/;
export const CONTACT_ERROR = "Enter an 11-digit mobile number starting with 09.";

// Optional wherever it is used, so blank is valid and only a number someone
// actually typed has to satisfy the pattern.
export function validateContactNumber(value: string): string | undefined {
  const entered = value.trim();
  if (!entered) return undefined;
  return CONTACT_PATTERN.test(entered) ? undefined : CONTACT_ERROR;
}

// The field can only ever hold digits: anything else is stripped as it arrives,
// whether typed or pasted. Stripping rather than refusing means a number copied
// from a contacts app as "+63 917 123 4567" still lands instead of being rejected
// — but it changes what the person just pasted, so the field says that it did.
// Length and prefix are left to validation: silently truncating an over-long
// number would turn a wrong number into a plausible one.
export function ContactNumberField({
  id,
  value,
  onChange,
  error,
  hint = "Optional. 11 digits, starting 09.",
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
}) {
  const [stripped, setStripped] = useState(false);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    const digits = raw.replace(/\D/g, "");

    // Clears itself on the next edit that needs no cleaning.
    setStripped(digits !== raw);
    onChange(digits);
  }

  return (
    <Field label="Contact number" htmlFor={id} hint={hint} error={error}>
      <>
        <Input
          id={id}
          name={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          spellCheck={false}
          placeholder="09171234567"
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? fieldNoteId(id) : undefined}
          value={value}
          onChange={handleChange}
        />
        {stripped && (
          <span aria-live="polite" className="text-muted text-[11px]">
            Removed characters that are not digits.
          </span>
        )}
      </>
    </Field>
  );
}
