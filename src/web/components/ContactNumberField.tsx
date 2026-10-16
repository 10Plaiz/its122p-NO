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
  const [notice, setNotice] = useState("");

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    const digits = raw.replace(/\D/g, "").slice(0, 11);

    setNotice(digits !== raw ? "Kept up to 11 digits. Removed formatting or extra digits. Check your number before saving." : "");
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
          maxLength={11}
          onPaste={(event) => {
            event.preventDefault();
            const input = event.currentTarget;
            const pasted = event.clipboardData.getData("text");
            const raw = value.slice(0, input.selectionStart ?? value.length) + pasted + value.slice(input.selectionEnd ?? value.length);
            const digits = raw.replace(/\D/g, "").slice(0, 11);
            setNotice(digits !== raw ? "Kept up to 11 digits. Removed formatting or extra digits. Check your number before saving." : "");
            onChange(digits);
          }}
          placeholder="09171234567"
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? fieldNoteId(id) : undefined}
          value={value}
          onChange={handleChange}
        />
        {notice && (
          <span aria-live="polite" className="text-muted text-[11px]">
            {notice}
          </span>
        )}
      </>
    </Field>
  );
}
