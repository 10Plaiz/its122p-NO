import { useState } from "react";
import { ContactNumberField, validateContactNumber } from "../components/ContactNumberField.js";
import { Alert, Button, Field, Input, Loading, Select, formatDate } from "../components/ui.js";
import { api } from "../lib/api.js";
import { useAction, useApi } from "../lib/useApi.js";
import { ROLES } from "../lib/types.js";
import type { Profile, Role } from "../lib/types.js";

// Wireframe 1q. Public registration always creates a citizen, so staff and admin
// accounts are made here — that is the only way to hand out either role.
export function AdminUsersPage() {
  const [roleFilter, setRoleFilter] = useState("");
  const { data, error, loading, reload } = useApi<{ users: Profile[] }>("/admin/users", {
    role: roleFilter,
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

      <div className="max-w-xs">
        <Field label="Role" htmlFor="role-filter">
          <Select id="role-filter" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
            <option value="">Every role</option>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </Select>
        </Field>
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
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState<Role>(user.role);
  const active = user.is_active !== false;

  const { run, pending, error } = useAction((body: Record<string, unknown>) =>
    api.patch<{ user: Profile }>(`/admin/users/${user.id}`, body),
  );

  async function save(body: Record<string, unknown>) {
    const done = await run(body);
    if (done) {
      setEditing(false);
      onDone();
    }
  }

  return (
    <tr>
      <td className="text-[13px]">{user.name}</td>
      <td className="font-mono text-[11px]">{user.email}</td>
      <td className="font-mono text-[11px]">{user.contact_number ?? "—"}</td>
      <td>
        {editing ? (
          <Select value={role} onChange={(event) => setRole(event.target.value as Role)}>
            {ROLES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        ) : (
          <span className="tag tag-outline">{user.role}</span>
        )}
      </td>
      <td className="text-[13px]">{active ? "Active" : "Deactivated"}</td>
      <td className="font-mono text-[11px]">{formatDate(user.created_at ?? null)}</td>
      <td>
        <div className="flex gap-2 flex-wrap">
          {editing ? (
            <>
              <Button type="button" variant="primary" disabled={pending} onClick={() => save({ role })}>
                Save
              </Button>
              <Button type="button" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button type="button" onClick={() => setEditing(true)}>
                Change role
              </Button>
              {/* Accounts are deactivated, never deleted, so their reports and
                  activity history survive. */}
              <Button type="button" disabled={pending} onClick={() => save({ is_active: !active })}>
                {active ? "Deactivate" : "Reactivate"}
              </Button>
            </>
          )}
        </div>
        {error && <span className="text-[11px] text-accent-700">{error.message}</span>}
      </td>
    </tr>
  );
}

function CreateUser({ onDone }: { onDone: () => void }) {
  const [values, setValues] = useState({
    name: "",
    email: "",
    password: "",
    contact_number: "",
    role: "staff" as Role,
  });
  const [touched, setTouched] = useState(false);

  const { run, pending, error } = useAction((body: Record<string, unknown>) =>
    api.post<{ user: Profile }>("/admin/users", body),
  );

  // Same rules the server applies in createUserSchema.
  const errors: Record<string, string> = {};
  if (values.name.trim().length < 2) errors.name = "Enter a full name.";
  if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) errors.email = "Enter a valid email address.";
  if (values.password.length < 8) errors.password = "Use at least 8 characters.";

  const contactError = validateContactNumber(values.contact_number);
  if (contactError) errors.contact_number = contactError;

  const shown = { ...(touched ? errors : {}), ...(error?.fieldErrors ?? {}) };

  return (
    <section className="border-2 border-divider p-4 flex flex-col gap-4">
      <h6>New account</h6>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Full name" htmlFor="new-name" error={shown.name}>
          <Input
            id="new-name"
            value={values.name}
            onChange={(event) => setValues((v) => ({ ...v, name: event.target.value }))}
          />
        </Field>

        <Field label="Email" htmlFor="new-email" error={shown.email}>
          <Input
            id="new-email"
            type="email"
            value={values.email}
            onChange={(event) => setValues((v) => ({ ...v, email: event.target.value }))}
          />
        </Field>

        <Field label="Password" htmlFor="new-password" hint="At least 8 characters" error={shown.password}>
          <Input
            id="new-password"
            type="password"
            value={values.password}
            onChange={(event) => setValues((v) => ({ ...v, password: event.target.value }))}
          />
        </Field>

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
                {role}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {error && <Alert title="Could not create the account">{error.message}</Alert>}

      <Button
        type="button"
        variant="primary"
        disabled={pending}
        onClick={async () => {
          setTouched(true);
          if (Object.keys(errors).length > 0) return;

          const contact = values.contact_number.trim();
          const done = await run({
            name: values.name.trim(),
            email: values.email.trim(),
            password: values.password,
            role: values.role,
            ...(contact ? { contact_number: contact } : {}),
          });
          if (done) onDone();
        }}
      >
        {pending ? "Creating..." : "Create account"}
      </Button>
    </section>
  );
}
