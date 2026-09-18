import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ContactNumberField, validateContactNumber } from "../components/ContactNumberField.js";
import { Alert, Button, Field, Input, focusFirstError } from "../components/ui.js";
import { useAuth } from "../lib/auth.js";
import { useAction } from "../lib/useApi.js";

// Rules mirror registerSchema in src/server/routes/auth.routes.ts, message for
// message, so a field never says one thing here and another after submitting.
function validate(values: { name: string; email: string; password: string; contact: string }) {
  const errors: Record<string, string> = {};

  if (values.name.trim().length < 2) errors.name = "Enter your full name.";
  if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) errors.email = "Enter a valid email address.";
  if (values.password.length < 8) errors.password = "Use at least 8 characters.";

  const contactError = validateContactNumber(values.contact);
  if (contactError) errors.contact_number = contactError;

  return errors;
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const { run, pending, error } = useAction(register);

  const [values, setValues] = useState({ name: "", email: "", password: "", contact: "" });
  const [touched, setTouched] = useState(false);

  const errors = validate(values);
  // Whatever the server rejected wins over the local guess for that field.
  const shown = { ...(touched ? errors : {}), ...(error?.fieldErrors ?? {}) };

  function set(field: keyof typeof values) {
    return (event: ChangeEvent<HTMLInputElement>) =>
      setValues((current) => ({ ...current, [field]: event.target.value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length > 0) {
      focusFirstError(errors, { contact_number: "contact" });
      return;
    }

    const contact = values.contact.trim();
    const created = await run({
      name: values.name.trim(),
      email: values.email.trim(),
      password: values.password,
      ...(contact ? { contact_number: contact } : {}),
    });

    // run() returns null when the request failed; only a success navigates away.
    if (created) navigate("/signin", { replace: true });
  }

  return (
    <div className="max-w-sm mx-auto flex flex-col gap-6 py-4">
      <h2>Register</h2>
      <p className="text-muted text-[13px]">Public sign-up always creates a citizen account.</p>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <Field label="Full name" htmlFor="name" error={shown.name} count={values.name.length} max={80}>
          <Input id="name" name="name" autoComplete="name" maxLength={80} value={values.name} onChange={set("name")} />
        </Field>

        <Field label="Email" htmlFor="email" error={shown.email} count={values.email.length} max={254}>
          <Input id="email" name="email" type="email" autoComplete="email" maxLength={254} spellCheck={false} value={values.email} onChange={set("email")} />
        </Field>

        <ContactNumberField
          id="contact"
          hint="Optional. 11 digits starting 09. Staff use this only if they need to reach you about the report."
          error={shown.contact_number}
          value={values.contact}
          onChange={(contact) => setValues((current) => ({ ...current, contact }))}
        />

        {/* Capped but not counted: a length readout on a secret is not worth showing. */}
        <Field label="Password" htmlFor="password" hint="At least 8 characters" error={shown.password}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            maxLength={72}
            value={values.password}
            onChange={set("password")}
          />
        </Field>

        {error && <Alert title="Could not create your account">{error.message}</Alert>}

        <Button type="submit" variant="primary" block disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="text-muted text-[13px]">
        Already registered? <Link to="/signin">Sign in</Link>
      </p>
    </div>
  );
}
