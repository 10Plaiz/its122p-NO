import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ContactNumberField, validateContactNumber } from "../components/ContactNumberField.js";
import { EmailCodeStep } from "../components/EmailCode.js";
import { PasswordRules } from "../components/PasswordRules.js";
import { ResidencyProofStep } from "../components/ResidencyProofStep.js";
import { Alert, Button, Field, Input, PasswordInput, Select, useLeftFields } from "../components/ui.js";
import { homePathFor, useAuth } from "../lib/auth.js";
import { ADDRESS_MAX, BARANGAYS, BARANGAY_ERROR, validateAddressLine } from "../lib/barangays.js";
import { NAME_PART_MAX, SUFFIXES, validateNameParts } from "../lib/names.js";
import { PASSWORD_MAX, validatePassword } from "../lib/passwords.js";
import { PROOF_STEP_PATH, residencyLocked } from "../lib/residency.js";
import { useAction } from "../lib/useApi.js";

// Mirrors registerSchema in src/server/routes/auth.routes.ts, message for message.
// Keys are the API's field names so a server field error lands on the same input.
export const PRIVACY_CONSENT_ERROR = "Agree to the privacy notice to create an account.";

type Values = {
  first: string;
  middle: string;
  last: string;
  suffix: string;
  email: string;
  password: string;
  contact: string;
  barangay: string;
  address: string;
  consent: boolean;
};

function validate(values: Values) {
  const errors: Record<string, string> = validateNameParts(values);

  if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) errors.email = "Enter a valid email address.";
  const password = validatePassword(values.password);
  if (password) errors.password = password;

  const contactError = validateContactNumber(values.contact);
  if (contactError) errors.contact_number = contactError;

  if (!values.barangay) errors.barangay = BARANGAY_ERROR;
  const address = validateAddressLine(values.address);
  if (address) errors.address_line = address;
  if (!values.consent) errors.privacy_consent = PRIVACY_CONSENT_ERROR;

  return errors;
}

export function RegisterPage() {
  const { user, register, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // UA-8: ?step=proof is the proof upload, the last step of registering. A
  // citizen without an accepted proof is kept here (decided 2026-10-03).
  const proofStep = searchParams.get("step") === "proof";
  const locked = residencyLocked(user);
  const { run, pending, error } = useAction(register);

  const [values, setValues] = useState<Values>({
    first: "",
    middle: "",
    last: "",
    suffix: "",
    email: "",
    password: "",
    contact: "",
    barangay: "",
    address: "",
    consent: false,
  });
  const fields = useLeftFields();
  // UA-5: set once the server has emailed a code; the screen then asks for it.
  const [sentTo, setSentTo] = useState<string | null>(null);

  // A signed-in user has no reason to see the form. A correct code signs the person
  // in, so this is also how registering moves on: to the proof step while the
  // account is locked, and home once it is not.
  useEffect(() => {
    if (loading) return;
    if (user && !locked) navigate(homePathFor(user), { replace: true });
    else if (user && !proofStep) navigate(PROOF_STEP_PATH, { replace: true });
    else if (!user && proofStep) navigate("/signin", { replace: true, state: { from: PROOF_STEP_PATH } });
  }, [loading, user, locked, proofStep, navigate]);

  const errors = validate(values);
  const invalid = Object.keys(errors).length > 0;
  // Whatever the server rejected wins over the local guess for that field.
  const shown = {
    ...fields.visible(errors, {
      first_name: "first-name",
      middle_name: "middle-name",
      last_name: "last-name",
      contact_number: "contact",
      address_line: "address",
      privacy_consent: "consent",
    }),
    ...(error?.fieldErrors ?? {}),
  };

  function set(field: keyof Values) {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setValues((current) => ({ ...current, [field]: event.target.value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (invalid) return;

    const contact = values.contact.trim();
    const middle = values.middle.trim();
    const created = await run({
      first_name: values.first.trim(),
      ...(middle ? { middle_name: middle } : {}),
      last_name: values.last.trim(),
      ...(values.suffix ? { suffix: values.suffix } : {}),
      email: values.email.trim(),
      password: values.password,
      ...(contact ? { contact_number: contact } : {}),
      barangay: values.barangay,
      address_line: values.address.trim(),
      privacy_consent: true,
    });

    // run() returns null when the request failed; only a success moves on.
    if (created) setSentTo(created.email);
  }

  if (user && locked) {
    return (
      <div className="max-w-md mx-auto flex flex-col gap-6 py-4">
        <h2>Prove you live in Makati</h2>
        <ResidencyProofStep />
      </div>
    );
  }

  if (sentTo) {
    return (
      <div className="max-w-md mx-auto flex flex-col gap-6 py-4">
        <h2>Confirm your email</h2>
        <EmailCodeStep
          email={sentTo}
          justSent
          backLabel="Use a different email"
          onBack={() => setSentTo(null)}
        />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto flex flex-col gap-6 py-4">
      <h2>Register</h2>
      <p className="text-muted text-[13px]">
        For people who live in Makati. Public sign-up always creates a citizen account.
      </p>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit} onBlur={fields.onBlur} noValidate>
        <fieldset className="m-0 flex flex-col gap-4 border-0 p-0">
          <legend className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">Your name</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" htmlFor="first-name" error={shown.first_name}>
              <Input id="first-name" name="first_name" autoComplete="given-name" maxLength={NAME_PART_MAX} value={values.first} onChange={set("first")} />
            </Field>
            <Field label="Middle name" htmlFor="middle-name" hint="Optional. The full name, not an initial." error={shown.middle_name}>
              <Input id="middle-name" name="middle_name" autoComplete="additional-name" maxLength={NAME_PART_MAX} value={values.middle} onChange={set("middle")} />
            </Field>
            <Field label="Last name" htmlFor="last-name" error={shown.last_name}>
              <Input id="last-name" name="last_name" autoComplete="family-name" maxLength={NAME_PART_MAX} value={values.last} onChange={set("last")} />
            </Field>
            <Field label="Suffix" htmlFor="suffix" hint="Optional." error={shown.suffix}>
              <Select id="suffix" name="suffix" autoComplete="honorific-suffix" value={values.suffix} onChange={set("suffix")}>
                <option value="">None</option>
                {SUFFIXES.map((suffix) => (
                  <option key={suffix} value={suffix}>
                    {suffix}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </fieldset>

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

        <fieldset className="m-0 flex flex-col gap-4 border-0 p-0">
          <legend className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">Where you live</legend>
          <Field label="Barangay" htmlFor="barangay" error={shown.barangay}>
            <Select id="barangay" name="barangay" value={values.barangay} onChange={set("barangay")}>
              <option value="">Choose your barangay</option>
              {BARANGAYS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="House number and street"
            htmlFor="address"
            hint="Used only to confirm you live in Makati."
            error={shown.address_line}
            count={values.address.length}
            max={ADDRESS_MAX}
          >
            <Input id="address" name="address_line" autoComplete="street-address" maxLength={ADDRESS_MAX} value={values.address} onChange={set("address")} />
          </Field>
        </fieldset>

        {/* Capped but not counted: a length readout on a secret is not worth showing. */}
        <Field label="Password" htmlFor="password" error={shown.password}>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            maxLength={PASSWORD_MAX}
            aria-describedby="password-rules"
            value={values.password}
            onChange={set("password")}
          />
        </Field>
        <PasswordRules id="password-rules" value={values.password} />

        <div className="flex flex-col gap-1">
          <label htmlFor="consent" className="flex items-start gap-2 text-[13px] cursor-pointer">
            <input
              id="consent"
              name="privacy_consent"
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-accent"
              checked={values.consent}
              aria-invalid={shown.privacy_consent ? true : undefined}
              aria-describedby={shown.privacy_consent ? "consent-error" : undefined}
              onChange={(event) => setValues((current) => ({ ...current, consent: event.target.checked }))}
            />
            <span>
              I agree that the City of Makati may use my name, contact details, and address to confirm that I live in
              Makati and to handle my reports, under the Data Privacy Act of 2012 (RA 10173).
            </span>
          </label>
          {shown.privacy_consent && (
            <span id="consent-error" className="text-[11px] text-accent-700">
              {shown.privacy_consent}
            </span>
          )}
        </div>

        {error && <Alert title="Could not create your account">{error.message}</Alert>}

        <Button type="submit" variant="primary" block disabled={pending || invalid}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="text-muted text-[13px]">
        Already registered? <Link to="/signin">Sign in</Link>
      </p>
    </div>
  );
}
