import { useState } from "react";
import { ContactNumberField, validateContactNumber } from "../components/ContactNumberField.js";
import { useToast } from "../components/Toast.js";
import { Alert, Button, Field, Input, Loading, Select, formatDate, useLeftFields } from "../components/ui.js";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";
import { useAction, useApi } from "../lib/useApi.js";
import { ROLES, ROLE_LABEL } from "../lib/types.js";
import { NAME_PART_MAX, SUFFIXES, validateNameParts } from "../lib/names.js";
import { PASSWORD_MAX, validatePassword } from "../lib/passwords.js";
import { PasswordRules } from "../components/PasswordRules.js";
import { ResidencyReview } from "../components/ResidencyReview.js";
import { RESIDENCY_LABEL, residencyStep } from "../lib/residency.js";
import type { Profile, Role } from "../lib/types.js";

// Wireframe 1q. Public registration always creates a citizen, so staff and admin
// accounts are made here — that is the only way to hand out either role.
export function AdminUsersPage() {
  const [roleFilter, setRoleFilter] = useState("");
  const [residencyFilter, setResidencyFilter] = useState("");
  const { data, error, loading, reload } = useApi<{ users: Profile[] }>("/admin/users", {
    role: roleFilter,
    residency: residencyFilter,
  });

  const [creating, setCreating] = useState(false);
  const users = data?.users ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2>User accounts</h2>
          <p className="text-muted text-[13px]">Citizens register themselves. Staff and admins are created here.</p>
        </div>
        <Button type="button" variant="primary" onClick={() => setCreating((open) => !open)}>
          {creating ? "Close" : "New account"}
        </Button>
      </header>

      {creating && (
        <CreateUser
          onDone={() => {
            setCreating(false);
            reload();
          }}
        />
      )}

      <div className="flex flex-wrap gap-4">
        <div className="w-full max-w-xs">
          <Field label="Role" htmlFor="role-filter">
            <Select id="role-filter" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
              <option value="">Every role</option>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABEL[role]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {/* UA-8: the proofs waiting for a decision are the ones an admin looks for. */}
        <div className="w-full max-w-xs">
          <Field label="Residency" htmlFor="residency-filter">
            <Select id="residency-filter" value={residencyFilter} onChange={(event) => setResidencyFilter(event.target.value)}>
              <option value="">Any residency</option>
              <option value="pending">Proof waiting for review</option>
              <option value="rejected">Proof rejected</option>
              <option value="verified">Verified resident</option>
            </Select>
          </Field>
        </div>
      </div>

      {error && <Alert title="Could not load users">{error.message}</Alert>}
      {loading && <Loading label="Loading users" />}

      {users.length > 0 && (
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Contact</th>
                <th>Role</th>
                <th>Residency</th>
                <th>Status</th>
                <th>Joined</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <UserRow key={user.id} user={user} onDone={reload} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function UserRow({ user, onDone }: { user: Profile; onDone: () => void }) {
  const toast = useToast();
  const { user: currentUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [role, setRole] = useState<Role>(user.role);
  const active = user.is_active !== false;

  // An admin cannot change their own role or deactivate themselves: the server
  // refuses both in PATCH /admin/users/:id, because an admin who demoted themselves
  // would lock everyone out. Saying so with a disabled control is the honest version:
  // offering the button and then rejecting the click taught nothing.
  const isSelf = currentUser?.id === user.id;

  const { run, pending, error } = useAction((body: Record<string, unknown>) =>
    api.patch<{ user: Profile }>(`/admin/users/${user.id}`, body),
  );
  // UA-6 fallback while there is no SMS budget: a number confirmed by other means.
  const phone = useAction((verified: boolean) =>
    api.patch<{ user: Profile }>(`/admin/users/${user.id}/phone-verified`, { verified }),
  );

  async function setPhoneVerified(verified: boolean) {
    if (await phone.run(verified)) {
      toast(verified ? "Mobile number marked as verified." : "Mobile number marked as not verified.");
      onDone();
    }
  }

  // Deactivating and reactivating rewrite the Status column in plain sight, so they
  // pass no confirmation; a role change only swaps a small tag, so it says so.
  async function save(body: Record<string, unknown>, confirmation?: string) {
    const done = await run(body);
    if (done) {
      setEditing(false);
      if (confirmation) toast(confirmation);
      onDone();
    }
  }

  return (
    <tr>
      <td className="text-[13px]">{user.name}</td>
      <td className="font-mono text-[11px]">{user.email}</td>
      <td className="font-mono text-[11px]">
        {user.contact_number ? (
          <div className="flex flex-col items-start gap-1">
            <span>{user.contact_number}</span>
            <span className={user.phone_verified_at ? "tag tag-outline" : "text-muted"}>
              {user.phone_verified_at ? "Verified" : "Not verified"}
            </span>
            <Button
              type="button"
              variant="ghost"
              className="!px-0 text-[11px]"
              disabled={phone.pending}
              onClick={() => setPhoneVerified(!user.phone_verified_at)}
            >
              {user.phone_verified_at ? "Mark not verified" : "Mark verified"}
              <span className="sr-only"> (mobile number of {user.name})</span>
            </Button>
            {phone.error && <span role="alert" className="text-accent-700">{phone.error.message}</span>}
          </div>
        ) : (
          "—"
        )}
      </td>
      <td>
        {editing ? (
          <Select
            aria-label={`Role for ${user.name}`}
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
          >
            {ROLES.map((option) => (
              <option key={option} value={option}>
                {ROLE_LABEL[option]}
              </option>
            ))}
          </Select>
        ) : (
          <span className="tag tag-outline">{ROLE_LABEL[user.role]}</span>
        )}
      </td>
      <td className="text-[13px]">
        {user.role === "citizen" ? (
          <div className="flex flex-col items-start gap-1">
            <span>{RESIDENCY_LABEL[residencyStep(user)]}</span>
            <Button type="button" variant="ghost" className="!px-0 text-[12px]" onClick={() => setReviewing(true)}>
              Review<span className="sr-only"> residency of {user.name}</span>
            </Button>
          </div>
        ) : (
          <span className="text-muted">—</span>
        )}
        {reviewing && (
          <ResidencyReview
            user={user}
            onClose={() => setReviewing(false)}
            onDone={() => {
              setReviewing(false);
              onDone();
            }}
          />
        )}
      </td>
      <td className="text-[13px]">{active ? "Active" : "Deactivated"}</td>
      <td className="font-mono text-[11px]">{formatDate(user.created_at ?? null)}</td>
      <td>
        <div className="flex gap-2 flex-wrap">
          {editing ? (
            <>
              <Button
                type="button"
                variant="primary"
                disabled={pending || role === user.role}
                onClick={() => save({ role }, "Role updated.")}
              >
                Save
              </Button>
              {/* Restores the dropdown as well as closing it. Leaving the picked role in
                  state meant reopening the row showed a change nobody had saved, and the
                  next Save applied it. */}
              <Button
                type="button"
                onClick={() => {
                  setRole(user.role);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button type="button" disabled={isSelf} onClick={() => setEditing(true)}>
                Change role
              </Button>
              {/* Accounts are deactivated, never deleted, so their reports and
                  activity history survive. */}
              <Button
                type="button"
                disabled={pending || isSelf}
                onClick={() => save({ is_active: !active })}
              >
                {active ? "Deactivate" : "Reactivate"}
              </Button>
            </>
          )}
        </div>
        {isSelf && <span className="text-muted text-[11px]">This is your own account.</span>}
        {error && <span role="alert" className="text-[11px] text-accent-700">{error.message}</span>}
      </td>
    </tr>
  );
}

function CreateUser({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [values, setValues] = useState({
    first: "",
    middle: "",
    last: "",
    suffix: "",
    email: "",
    password: "",
    contact_number: "",
    role: "staff" as Role,
  });
  const fields = useLeftFields();

  const { run, pending, error } = useAction((body: Record<string, unknown>) =>
    api.post<{ user: Profile }>("/admin/users", body),
  );

  // Same rules the server applies in createUserSchema.
  const errors: Record<string, string> = validateNameParts(values);
  if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) errors.email = "Enter a valid email address.";
  const passwordError = validatePassword(values.password);
  if (passwordError) errors.password = passwordError;

  const contactError = validateContactNumber(values.contact_number);
  if (contactError) errors.contact_number = contactError;

  const invalid = Object.keys(errors).length > 0;
  const shown = {
    ...fields.visible(errors, {
      first_name: "new-first-name",
      middle_name: "new-middle-name",
      last_name: "new-last-name",
      email: "new-email",
      password: "new-password",
      contact_number: "new-contact",
    }),
    ...(error?.fieldErrors ?? {}),
  };

  return (
    <section className="border-2 border-divider p-4 flex flex-col gap-4" onBlur={fields.onBlur}>
      <h6>New account</h6>

      {/* These fields describe somebody else's account, not the signed-in administrator's,
          so autofill is turned away from all three: a password manager offering the
          admin's own address here would quietly create the wrong account, and
          `new-password` stops it treating the field as a login to fill or to save. */}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="First name" htmlFor="new-first-name" error={shown.first_name}>
          <Input
            id="new-first-name"
            name="new-first-name"
            autoComplete="off"
            maxLength={NAME_PART_MAX}
            value={values.first}
            onChange={(event) => setValues((v) => ({ ...v, first: event.target.value }))}
          />
        </Field>

        <Field label="Middle name" htmlFor="new-middle-name" hint="Optional. The full name, not an initial." error={shown.middle_name}>
          <Input
            id="new-middle-name"
            name="new-middle-name"
            autoComplete="off"
            maxLength={NAME_PART_MAX}
            value={values.middle}
            onChange={(event) => setValues((v) => ({ ...v, middle: event.target.value }))}
          />
        </Field>

        <Field label="Last name" htmlFor="new-last-name" error={shown.last_name}>
          <Input
            id="new-last-name"
            name="new-last-name"
            autoComplete="off"
            maxLength={NAME_PART_MAX}
            value={values.last}
            onChange={(event) => setValues((v) => ({ ...v, last: event.target.value }))}
          />
        </Field>

        <Field label="Suffix" htmlFor="new-suffix" hint="Optional." error={shown.suffix}>
          <Select
            id="new-suffix"
            value={values.suffix}
            onChange={(event) => setValues((v) => ({ ...v, suffix: event.target.value }))}
          >
            <option value="">None</option>
            {SUFFIXES.map((suffix) => (
              <option key={suffix} value={suffix}>
                {suffix}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Email" htmlFor="new-email" error={shown.email} count={values.email.length} max={254}>
          <Input
            id="new-email"
            name="new-email"
            type="email"
            autoComplete="off"
            maxLength={254}
            spellCheck={false}
            value={values.email}
            onChange={(event) => setValues((v) => ({ ...v, email: event.target.value }))}
          />
        </Field>

        {/* Capped but not counted: a length readout on a secret is not worth showing. */}
        <div className="flex flex-col gap-2">
          <Field label="Password" htmlFor="new-password" error={shown.password}>
            <Input
              id="new-password"
              name="new-password"
              type="password"
              autoComplete="new-password"
              maxLength={PASSWORD_MAX}
              aria-describedby="new-password-rules"
              value={values.password}
              onChange={(event) => setValues((v) => ({ ...v, password: event.target.value }))}
            />
          </Field>
          <PasswordRules id="new-password-rules" value={values.password} />
        </div>

        <ContactNumberField
          id="new-contact"
          error={shown.contact_number}
          value={values.contact_number}
          onChange={(contact_number) => setValues((v) => ({ ...v, contact_number }))}
        />

        <Field label="Role" htmlFor="new-role" error={shown.role}>
          <Select
            id="new-role"
            value={values.role}
            onChange={(event) => setValues((v) => ({ ...v, role: event.target.value as Role }))}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABEL[role]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {error && <Alert title="Could not create the account">{error.message}</Alert>}

      <Button
        type="button"
        variant="primary"
        disabled={pending || invalid}
        onClick={async () => {
          if (invalid) return;

          const contact = values.contact_number.trim();
          const middle = values.middle.trim();
          const done = await run({
            first_name: values.first.trim(),
            ...(middle ? { middle_name: middle } : {}),
            last_name: values.last.trim(),
            ...(values.suffix ? { suffix: values.suffix } : {}),
            email: values.email.trim(),
            password: values.password,
            role: values.role,
            ...(contact ? { contact_number: contact } : {}),
          });
          if (done) {
            // Was left filled in, so the new account's password stayed on screen and a
            // second click would try to create it again.
            setValues({ first: "", middle: "", last: "", suffix: "", email: "", password: "", contact_number: "", role: "staff" });
            fields.reset();
            toast(`Account created for ${done.user.name}.`);
            onDone();
          }
        }}
      >
        {pending ? "Creating…" : "Create account"}
      </Button>
    </section>
  );
}
