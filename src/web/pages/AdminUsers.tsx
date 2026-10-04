import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ContactNumberField, validateContactNumber } from "../components/ContactNumberField.js";
import { useToast } from "../components/Toast.js";
import { Alert, Button, EmptyState, Field, Input, Loading, Select, StatusPill, formatDate, useLeftFields } from "../components/ui.js";
import { TableToolbar, ToolbarItem } from "../components/data-table/index.js";
import { FilterOption } from "../components/FilterOption.js";
import { countFilterOptions } from "../lib/filter-counts.js";
import type { FilterValues } from "../lib/filter-counts.js";
import { ApiError, api } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";
import { useAction, useApi } from "../lib/useApi.js";
import { ROLES, ROLE_LABEL } from "../lib/types.js";
import { NAME_PART_MAX, SUFFIXES, validateNameParts } from "../lib/names.js";
import { PASSWORD_MAX, validatePassword } from "../lib/passwords.js";
import { PasswordRules } from "../components/PasswordRules.js";
import { ResidencyReview } from "../components/ResidencyReview.js";
import { SpecializationEditor } from "../components/SpecializationEditor.js";
import { AreaEditor } from "../components/AreaEditor.js";
import { RESIDENCY_LABEL, residencyStep } from "../lib/residency.js";
import type { Profile, Role } from "../lib/types.js";

function userFilterValues(user: Profile): FilterValues {
  return {
    role: user.role,
    status: user.is_active === false ? "deactivated" : "active",
    residency: user.residency_status === "pending" && !user.has_residency_proof ? "" : user.residency_status ?? "",
  };
}

export function AdminUsersPage() {
  const [roleFilter, setRoleFilter] = useState("");
  const [residencyFilter, setResidencyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const { data, error, loading, reload } = useApi<{ users: Profile[] }>("/admin/users");

  const [creating, setCreating] = useState(false);
  const newAccountRef = useRef<HTMLButtonElement>(null);
  const wasCreating = useRef(false);
  useEffect(() => {
    if (wasCreating.current && !creating) newAccountRef.current?.focus();
    wasCreating.current = creating;
  }, [creating]);
  const users = data?.users ?? [];
  const query = search.trim().toLocaleLowerCase();
  const searchedUsers = users.filter((user) => [user.name, user.email, user.contact_number ?? ""].some((value) => value.toLocaleLowerCase().includes(query)));
  const selected = { role: roleFilter, residency: residencyFilter, status: statusFilter };
  const visibleUsers = searchedUsers.filter((user) => {
    const values = userFilterValues(user);
    return Object.entries(selected).every(([name, value]) => !value || values[name] === value);
  });
  const countRows = data && !loading && !error ? searchedUsers.map((user) => ({ id: user.id, values: userFilterValues(user) })) : null;
  const counts = countFilterOptions(countRows, selected);
  // Choosing staff/admin also clears residency, so their counts reflect that action.
  const rolesWithoutResidency = countFilterOptions(countRows, { role: roleFilter, status: statusFilter }).role;
  const roleCounts = counts.role && rolesWithoutResidency ? {
    ...counts.role,
    values: new Map([...counts.role.values, ...["staff", "admin"].map((role): [string, number] => [role, rolesWithoutResidency.values.get(role) ?? 0])]),
  } : undefined;
  const filtered = Boolean(roleFilter || residencyFilter || statusFilter || query);

  function clearFilters() {
    setRoleFilter("");
    setResidencyFilter("");
    setStatusFilter("");
    setSearch("");
  }

  return (
    <div className="flex flex-col gap-6">
      <TableToolbar
        title="User accounts"
        description="Manage access, verify residents, and route staff to their areas."
        action={
          <Button ref={newAccountRef} type="button" variant="primary" disabled={creating}
            aria-expanded={creating} aria-controls={creating ? "new-account-form" : undefined} onClick={() => setCreating(true)}>
            New account
          </Button>
        }
        search={
          <Field label="Search" htmlFor="user-search">
            <Input id="user-search" type="search" autoComplete="off" maxLength={100}
              placeholder="Name, email, or mobile…" value={search} onChange={(event) => setSearch(event.target.value)} />
          </Field>
        }
      >
        <ToolbarItem>
          <Field label="Role" htmlFor="role-filter">
            <Select id="role-filter" value={roleFilter} onChange={(event) => {
              const next = event.target.value;
              setRoleFilter(next);
              if (next === "staff" || next === "admin") setResidencyFilter("");
            }}>
              <FilterOption value="" label="Every role" counts={roleCounts} />
              {ROLES.map((role) => (
                <FilterOption key={role} value={role} label={ROLE_LABEL[role]} counts={roleCounts} />
              ))}
            </Select>
          </Field>
        </ToolbarItem>
        <ToolbarItem>
          <Field label="Residency" htmlFor="residency-filter">
            <Select id="residency-filter" value={residencyFilter} disabled={roleFilter === "staff" || roleFilter === "admin"}
              aria-describedby="residency-filter-note" onChange={(event) => setResidencyFilter(event.target.value)}>
              <FilterOption value="" label="Any residency" counts={counts.residency} />
              <FilterOption value="pending" label="Proof waiting for review" counts={counts.residency} />
              <FilterOption value="rejected" label="Proof rejected" counts={counts.residency} />
              <FilterOption value="verified" label="Verified resident" counts={counts.residency} />
            </Select>
          </Field>
          <span className="sr-only" id="residency-filter-note">Residency applies to citizens. Choose Every role or Citizen to use this filter.</span>
        </ToolbarItem>
        <ToolbarItem>
          <Field label="Account status" htmlFor="user-status-filter">
            <Select id="user-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <FilterOption value="" label="Any status" counts={counts.status} />
              <FilterOption value="active" label="Active" counts={counts.status} />
              <FilterOption value="deactivated" label="Deactivated" counts={counts.status} />
            </Select>
          </Field>
        </ToolbarItem>
      </TableToolbar>

      {creating && (
        <CreateUser onCancel={() => setCreating(false)} onDone={() => { setCreating(false); reload(); }} />
      )}

      {error && <Alert title="Could not load users">
        <p>{error.message}</p>
        <Button type="button" onClick={reload}>Try again</Button>
      </Alert>}
      {loading && <Loading label="Loading users" />}

      {!loading && !error && data && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="status" className="m-0 text-muted text-[13px]">
            {visibleUsers.length} {visibleUsers.length === 1 ? "account" : "accounts"}{filtered ? visibleUsers.length === 1 ? " matches your filters" : " match your filters" : " in total"}
          </p>
          {filtered && <Button type="button" variant="ghost" onClick={clearFilters}>Clear filters</Button>}
        </div>
      )}
      {!loading && !error && visibleUsers.length === 0 && (
        <EmptyState title={filtered ? "No accounts match your filters" : "No user accounts yet"}>
          {filtered ? "Try another name, email, or mobile number, or clear the filters." : "Citizens appear here after registering. Use New account to add staff or an administrator."}
        </EmptyState>
      )}
      {!loading && !error && visibleUsers.length > 0 && (
        <div className="relative overflow-x-auto">
          <table className="table account-table w-full" role="table" aria-label="User accounts">
            <caption className="sr-only">User accounts matching the selected filters.</caption>
            <thead role="rowgroup">
              <tr role="row">
                <th scope="col">Account</th>
                <th scope="col">Role</th>
                <th scope="col">Residency</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {visibleUsers.map((user) => (
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
  const [confirmingActivation, setConfirmingActivation] = useState(false);
  // SW-1: a staff member's categories and barangays open in a row of their own.
  const [specializing, setSpecializing] = useState(false);
  const specializationsId = `specializations-row-${user.id}`;
  const [role, setRole] = useState<Role>(user.role);
  const active = user.is_active !== false;

  const isSelf = currentUser?.id === user.id;

  const { run, pending, error, setError } = useAction((body: { role?: Role; is_active?: boolean }) =>
    api.patch<{ user: Profile }>(`/admin/users/${user.id}`, body),
  );
  // UA-6 fallback while there is no SMS budget: a number confirmed by other means.
  const phone = useAction((verified: boolean) =>
    api.patch<{ user: Profile }>(`/admin/users/${user.id}/phone-verified`, { verified }),
  );

  async function setPhoneVerified(verified: boolean) {
    if (phone.pending || pending) return;
    if (await phone.run(verified)) {
      toast(verified ? "Mobile number marked as verified." : "Mobile number marked as not verified.");
      onDone();
    }
  }

  async function save(body: { role?: Role; is_active?: boolean }, confirmation: string) {
    if (isSelf || pending || phone.pending) return false;
    const done = await run(body);
    if (done) {
      setEditing(false);
      toast(confirmation);
      onDone();
    }
    return Boolean(done);
  }

  return (
    <>
      <tr role="row">
        <td role="cell" className="account-identity">
          <div className="mb-2 flex flex-col items-start gap-1">
            <span className="text-[14px] font-semibold">{user.name}</span>
            <span className="break-all font-mono text-[11px]" translate="no">{user.email}</span>
            <span className="text-muted text-[11px]">Joined {formatDate(user.created_at ?? null)}</span>
          </div>
          {user.contact_number ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
              <span className="font-mono" translate="no">{user.contact_number}</span>
              <StatusPill tone={user.phone_verified_at ? "success" : "warning"}>
                {user.phone_verified_at ? "Number verified" : "Number not verified"}
              </StatusPill>
              <Button
                type="button"
                variant="ghost"
                className="!px-0 text-[11px]"
                disabled={phone.pending || pending}
                aria-busy={phone.pending}
                onClick={() => setPhoneVerified(!user.phone_verified_at)}
              >
                {phone.pending ? "Saving…" : user.phone_verified_at ? "Mark not verified" : "Mark verified"}
                <span className="sr-only"> (mobile number of {user.name})</span>
              </Button>
              {phone.error && <span role="alert" className="text-danger">{phone.error.message}</span>}
            </div>
          ) : (
            <span className="text-muted text-[12px]">No mobile number</span>
          )}
        </td>
        <td role="cell" data-label="Role">
          {editing ? (
            <Field label="New role" htmlFor={`role-${user.id}`} error={error?.fieldErrors.role}>
              <Select id={`role-${user.id}`} aria-label={`Role for ${user.name}`} value={role} disabled={pending}
                onChange={(event) => {
                  const next = ROLES.find((value) => value === event.target.value);
                  if (next) setRole(next);
                  setError(null);
                }}>
                {ROLES.map((option) => <option key={option} value={option}>{ROLE_LABEL[option]}</option>)}
              </Select>
            </Field>
          ) : (
            <span className="tag tag-neutral">{ROLE_LABEL[user.role]}</span>
          )}
        </td>
        <td role="cell" data-label="Residency" className="text-[13px]">
          {user.role === "citizen" ? (
            <div className="flex flex-col items-start gap-1">
              <StatusPill tone={residencyStep(user) === "verified" ? "success" : "warning"}>
                {residencyStep(user) === "pending" ? "Awaiting review" : RESIDENCY_LABEL[residencyStep(user)]}
              </StatusPill>
              <Button type="button" variant="ghost" className="!px-0 text-[12px]" disabled={pending || phone.pending} onClick={() => setReviewing(true)}>
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
        <td role="cell" data-label="Status">
          <StatusPill tone={active ? "success" : "neutral"}>{active ? "Active" : "Deactivated"}</StatusPill>
        </td>
        <td role="cell" data-label="Actions">
          <div className="flex gap-2 flex-wrap">
            {editing ? (
              <>
                <Button
                  type="button"
                  variant="primary"
                  disabled={pending || phone.pending || role === user.role}
                  aria-busy={pending}
                  onClick={() => save({ role }, `Role updated for ${user.name}.`)}
                >
                  {pending ? "Saving…" : "Save role"}
                </Button>
                {/* Restores the dropdown as well as closing it. Leaving the picked role in
                    state meant reopening the row showed a change nobody had saved, and the
                    next Save applied it. */}
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setRole(user.role);
                    setEditing(false);
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button type="button" disabled={isSelf || pending || phone.pending}
                  aria-describedby={isSelf ? `self-restriction-${user.id}` : undefined}
                  onClick={() => { setRole(user.role); setError(null); setEditing(true); }}>
                  Change role
                  <span className="sr-only"> for {user.name}</span>
                </Button>
                {user.role === "staff" && (
                  <Button
                    type="button"
                    aria-expanded={specializing}
                    aria-controls={specializing ? specializationsId : undefined}
                    disabled={pending || phone.pending}
                    onClick={() => setSpecializing((open) => !open)}
                  >
                    {specializing ? "Close routing" : "Routing"}
                    <span className="sr-only"> for {user.name}: specializations and areas</span>
                  </Button>
                )}
                {/* Accounts are deactivated, never deleted, so their reports and
                    activity history survive. */}
                <Button
                  type="button"
                  variant={active ? "danger-outline" : "secondary"}
                  disabled={pending || phone.pending || isSelf}
                  aria-describedby={isSelf ? `self-restriction-${user.id}` : undefined}
                  onClick={() => { setError(null); setConfirmingActivation(true); }}
                >
                  {active ? "Deactivate" : "Reactivate"}
                  <span className="sr-only"> {user.name}</span>
                </Button>
              </>
            )}
          </div>
          {isSelf && <p id={`self-restriction-${user.id}`} className="mb-0 mt-2 text-muted text-[12px]">
            This is your own account. You cannot change your own role or deactivate it.
          </p>}
          {error && !confirmingActivation && <p role="alert" className="mb-0 text-[12px] text-danger">{error.message}</p>}
          {confirmingActivation && <ActivationConfirmation user={user} pending={pending} error={error?.message}
            onClose={() => { if (!pending) { setConfirmingActivation(false); setError(null); } }}
            onConfirm={async () => {
              if (await save({ is_active: !active }, `${user.name} ${active ? "deactivated" : "reactivated"}.`)) setConfirmingActivation(false);
            }} />}
        </td>
      </tr>
      {specializing && (
        <tr id={specializationsId} role="row" className="account-routing-row">
          <td role="cell" colSpan={5} className="bg-neutral-200/60">
            <div className="grid gap-3 lg:grid-cols-2 items-start">
              <SpecializationEditor staffId={user.id} staffName={user.name} />
              <AreaEditor staffId={user.id} staffName={user.name} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ActivationConfirmation({ user, pending, error, onClose, onConfirm }: {
  user: Profile;
  pending: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const active = user.is_active !== false;

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    dialog?.showModal();
    cancelRef.current?.focus();
    return () => { dialog?.close(); previous?.focus(); };
  }, []);

  return (
    <dialog ref={dialogRef} className="dialog account-confirmation max-h-[90vh] overflow-y-auto"
      aria-labelledby={`activation-title-${user.id}`} aria-describedby={`activation-description-${user.id}`} aria-busy={pending}
      onCancel={(event) => { event.preventDefault(); if (!pending) onClose(); }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget || pending) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}>
      <h4 className="dialog-title" id={`activation-title-${user.id}`}>{active ? "Deactivate" : "Reactivate"} {user.name}?</h4>
      <div className="dialog-body">
        <p id={`activation-description-${user.id}`} className="m-0 text-[14px]">
          {active ? "This person will lose access to KAMOTI. Their reports and activity history will be kept." : "This person will be able to sign in again with their current role."}
        </p>
        <p className="mt-3 break-all font-mono text-[12px]">{user.email}</p>
        {error && <Alert title={`Could not ${active ? "deactivate" : "reactivate"} the account`}>{error}</Alert>}
      </div>
      <div className="dialog-actions flex-wrap">
        <Button ref={cancelRef} type="button" onClick={onClose} disabled={pending}>Cancel</Button>
        <Button type="button" variant={active ? "danger" : "primary"} disabled={pending} aria-busy={pending} onClick={onConfirm}>
          {pending ? "Saving…" : active ? "Deactivate account" : "Reactivate account"}
        </Button>
      </div>
    </dialog>
  );
}

function CreateUser({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
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

  const { run, pending, error, setError } = useAction((body: Record<string, unknown>) =>
    api.post<{ user: Profile }>("/admin/users", body),
  );

  // Same rules the server applies in createUserSchema.
  const errors: Record<string, string> = validateNameParts(values);
  if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) errors.email = "Enter a valid email address.";
  const passwordError = validatePassword(values.password);
  if (passwordError) errors.password = passwordError;

  const contactError = validateContactNumber(values.contact_number);
  if (contactError) errors.contact_number = contactError;

  const fieldIds = {
    first_name: "new-first-name",
    middle_name: "new-middle-name",
    last_name: "new-last-name",
    suffix: "new-suffix",
    email: "new-email",
    password: "new-password",
    contact_number: "new-contact",
    role: "new-role",
  };
  const invalid = Object.keys(errors).length > 0 || Object.keys(error?.fieldErrors ?? {}).length > 0;
  const shown = {
    ...fields.visible(errors, fieldIds),
    ...(error?.fieldErrors ?? {}),
  };

  function clearChangedError(event: FormEvent<HTMLFormElement>) {
    if (!error) return;
    const input = event.target;
    if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement)) return;
    const field = Object.entries(fieldIds).find(([, id]) => id === input.id)?.[0];
    const serverErrors = Object.entries(error.fieldErrors);
    if (!serverErrors.length) { setError(null); return; }
    if (!field || !error.fieldErrors[field]) return;
    const remaining = serverErrors.filter(([key]) => key !== field).map(([key, message]) => ({ field: key, message }));
    setError(remaining.length ? new ApiError(error.status, error.message, remaining) : null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (invalid || pending) return;
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
      toast(`Account created for ${done.user.name}.`);
      onDone();
    }
  }

  return (
    <form id="new-account-form" className="border-2 border-divider p-4 flex flex-col gap-4" aria-labelledby="new-account-title" noValidate
      onSubmit={submit} onBlur={fields.onBlur} onChange={clearChangedError} aria-busy={pending}>
      <div>
        <h3 id="new-account-title" className="m-0 text-[18px]">New account</h3>
        <p className="mb-0 mt-1 text-muted text-[13px]">Citizens can register themselves. Use this form to add staff or an administrator.</p>
      </div>

      {/* These fields describe somebody else's account, not the signed-in administrator's,
          so autofill is turned away from all three: a password manager offering the
          admin's own address here would quietly create the wrong account, and
          `new-password` stops it treating the field as a login to fill or to save. */}
      <fieldset disabled={pending} className="m-0 min-w-0 border-0 p-0 grid gap-3 md:grid-cols-2">
        <Field label="First name" htmlFor="new-first-name" error={shown.first_name}>
          <Input
            id="new-first-name"
            autoFocus
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
            onChange={(event) => {
              const next = ROLES.find((value) => value === event.target.value);
              if (next) setValues((v) => ({ ...v, role: next }));
            }}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABEL[role]}
              </option>
            ))}
          </Select>
        </Field>
      </fieldset>

      {error && <Alert title="Could not create the account">{error.message}</Alert>}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={pending || invalid} aria-busy={pending}>
          {pending ? "Creating…" : "Create account"}
        </Button>
        <Button type="button" disabled={pending} onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
