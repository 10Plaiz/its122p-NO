import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { ContactNumberField, validateContactNumber } from "../components/ContactNumberField.js";
import { ResidencyProofStep } from "../components/ResidencyProofStep.js";
import { useToast } from "../components/Toast.js";
import { Alert, Button, Field, Input, Select, useLeftFields } from "../components/ui.js";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";
import { ADDRESS_MAX, BARANGAYS, BARANGAY_ERROR, validateAddressLine } from "../lib/barangays.js";
import { NAME_PART_MAX, SUFFIXES, validateNameParts } from "../lib/names.js";
import { RESIDENCY_LABEL, residencyStep } from "../lib/residency.js";
import { useAction } from "../lib/useApi.js";
import type { Profile } from "../lib/types.js";

// UA-13: a citizen reads and corrects their own details, under the registration
// rules (PATCH /api/auth/me). Email stays out: changing it needs a new code.
// The account from /auth/me carries the name parts as well (ACCOUNT_FIELDS).
type AccountProfile = Profile & {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  suffix?: string | null;
};

type Values = { first: string; middle: string; last: string; suffix: string; contact: string; barangay: string; address: string };

function valuesOf(user: AccountProfile): Values {
  return {
    first: user.first_name ?? "",
    middle: user.middle_name ?? "",
    last: user.last_name ?? "",
    suffix: user.suffix ?? "",
    contact: user.contact_number ?? "",
    barangay: user.barangay ?? "",
    address: user.address_line ?? "",
  };
}

// Mirrors accountUpdateSchema in src/server/routes/auth.routes.ts, message for message.
function validate(values: Values) {
  const errors: Record<string, string> = validateNameParts(values);
  const contactError = validateContactNumber(values.contact);
  if (contactError) errors.contact_number = contactError;
  if (!values.barangay) errors.barangay = BARANGAY_ERROR;
  const address = validateAddressLine(values.address);
  if (address) errors.address_line = address;
  return errors;
}

export function AccountPage() {
  const { user, replaceUser } = useAuth();
  const [editing, setEditing] = useState(false);
  if (!user) return null;
  const account = user as AccountProfile;
  const step = residencyStep(account);

  return (
    <div className="max-w-2xl flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h2>My account</h2>
        <p className="text-muted text-[13px]">Your details as staff and administrators see them.</p>
      </header>

      {editing ? (
        <EditDetails account={account} onDone={() => setEditing(false)} onSaved={replaceUser} />
      ) : (
        <section className="flex flex-col gap-4" aria-labelledby="details-title">
          <h6 id="details-title" className="!m-0">
            Details
          </h6>
          <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-2 text-[14px] !m-0">
            <dt className="text-muted">Name</dt>
            <dd className="!m-0 break-words">{account.name}</dd>
            <dt className="text-muted">Email</dt>
            <dd className="!m-0 break-all" translate="no">
              {account.email}
            </dd>
            <dt className="text-muted">Mobile number</dt>
            <dd className="!m-0">
              {account.contact_number ? (
                <>
                  <span translate="no">{account.contact_number}</span>
                  <span className="text-muted"> · {account.phone_verified_at ? "verified" : "not verified"}</span>
                </>
              ) : (
                <span className="text-muted">Not given</span>
              )}
            </dd>
            <dt className="text-muted">Barangay</dt>
            <dd className="!m-0">{account.barangay ?? "—"}</dd>
            <dt className="text-muted">House number and street</dt>
            <dd className="!m-0 break-words">{account.address_line ?? "—"}</dd>
            <dt className="text-muted">Residency</dt>
            <dd className="!m-0">{RESIDENCY_LABEL[step]}</dd>
          </dl>
          <p className="text-[12px] text-muted !m-0">
            To change your email address, contact a City administrator.
          </p>
          <Button type="button" className="self-start" onClick={() => setEditing(true)}>
            Edit details
          </Button>
        </section>
      )}

      {/* UA-8: until an administrator accepts it, the citizen can send a proof for
          the address on file, which matters most right after changing it. */}
      {step === "pending" && (
        <section className="flex flex-col gap-3 border-t border-divider pt-6" aria-labelledby="proof-title">
          <h6 id="proof-title" className="!m-0">
            Proof of residency
          </h6>
          <ResidencyProofStep variant="account" />
        </section>
      )}
    </div>
  );
}

function EditDetails({
  account,
  onDone,
  onSaved,
}: {
  account: AccountProfile;
  onDone: () => void;
  onSaved: (profile: Profile) => void;
}) {
  const toast = useToast();
  const saved = valuesOf(account);
  const [values, setValues] = useState<Values>(saved);
  const fields = useLeftFields();

  const { run, pending, error } = useAction((body: Record<string, unknown>) =>
    api.patch<{ user: Profile }>("/auth/me", body),
  );

  const errors = validate(values);
  const invalid = Object.keys(errors).length > 0;
  const unchanged = (Object.keys(saved) as (keyof Values)[]).every((key) => saved[key].trim() === values[key].trim());
  const addressChanging = values.barangay !== saved.barangay || values.address.trim() !== saved.address.trim();
  // An account an administrator verified without any upload has no proof to send
  // back to review, so a new address needs one before KAMOTI opens again (UA-8,
  // decision 2026-10-04).
  const noProofOnFile = !account.has_residency_proof;
  const phoneChanging = values.contact.trim() !== saved.contact.trim();
  const shown = {
    ...fields.visible(errors, {
      first_name: "first-name",
      middle_name: "middle-name",
      last_name: "last-name",
      contact_number: "contact",
      address_line: "address",
    }),
    ...(error?.fieldErrors ?? {}),
  };

  function set(field: keyof Values) {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setValues((current) => ({ ...current, [field]: event.target.value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (invalid || unchanged) return;
    const middle = values.middle.trim();
    const contact = values.contact.trim();
    const result = await run({
      first_name: values.first.trim(),
      ...(middle ? { middle_name: middle } : {}),
      last_name: values.last.trim(),
      ...(values.suffix ? { suffix: values.suffix } : {}),
      ...(contact ? { contact_number: contact } : {}),
      barangay: values.barangay,
      address_line: values.address.trim(),
    });
    if (!result) return;
    onSaved(result.user);
    toast(
      !addressChanging
        ? "Details saved."
        : noProofOnFile
          ? "Details saved. Upload a proof for your new address to continue."
          : "Details saved. Send a proof for your new address below.",
    );
    onDone();
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} onBlur={fields.onBlur} noValidate aria-labelledby="edit-title">
      <h6 id="edit-title" className="!m-0">
        Edit details
      </h6>

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

      <ContactNumberField
        id="contact"
        hint={
          phoneChanging && saved.contact
            ? "A new number is not verified until an administrator confirms it."
            : "Optional. 11 digits starting 09. Staff use this only if they need to reach you about a report."
        }
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

      {/* Said before saving, not after: the consequence should not be a surprise. */}
      {addressChanging && (
        <p role="status" className="text-[13px] border-l-2 border-warning-700 pl-3 !m-0">
          {noProofOnFile
            ? "A new address needs a proof of residency, and there is none on your account yet. After saving, you will be asked to upload one before you can continue."
            : 'A new address goes back to an administrator for review. You can keep using KAMOTI; your reports show "Unverified resident" until a proof for the new address is accepted.'}
        </p>
      )}

      {error && Object.keys(error.fieldErrors).length === 0 && <Alert title="Could not save your details">{error.message}</Alert>}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="primary" disabled={pending || invalid || unchanged}>
          {pending ? "Saving…" : "Save details"}
        </Button>
        <Button type="button" disabled={pending} onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
