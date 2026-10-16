import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ComponentProps, FormEvent, ReactNode, RefObject } from "react";
import { useSearchParams } from "react-router-dom";
import { SuffixField } from "../components/SuffixField.js";
import { ContactNumberField, validateContactNumber } from "../components/ContactNumberField.js";
import { useToast } from "../components/Toast.js";
import { Alert, Button, EmptyState, Field, Input, Loading, Select, StatusPill, formatDate, useLeftFields } from "../components/ui.js";
import { NumberedPagination, TableToolbar, ToolbarItem } from "../components/data-table/index.js";
import { lastPage, parsePage } from "../components/data-table/pages.js";
import { useDisclosure } from "../components/data-table/useDisclosure.js";
import { ModalDialog } from "../components/ModalDialog.js";
import { FilterOption } from "../components/FilterOption.js";
import { countFilterOptions } from "../lib/filter-counts.js";
import type { FilterValues } from "../lib/filter-counts.js";
import { ApiError, api } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";
import { useAction, useApi } from "../lib/useApi.js";
import { ROLES, ROLE_LABEL } from "../lib/types.js";
import { NAME_PART_MAX, canonicalSuffix, validateNameParts } from "../lib/names.js";
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

function formatJoinedDate(value: Profile["created_at"]) {
  return value && Number.isFinite(Date.parse(value)) ? formatDate(value) : "Not recorded";
}

export function AdminUsersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const roleFilter = searchParams.get("role") === "all" ? "" : ROLES.find((role) => role === searchParams.get("role")) ?? "citizen";
  const residencyDisabled = roleFilter === "staff" || roleFilter === "admin";
  const residencyFilter = residencyDisabled ? "" : ["pending", "rejected", "verified"].find((status) => status === searchParams.get("residency")) ?? "";
  const statusFilter = searchParams.get("status") === "all" ? "" : searchParams.get("status") === "deactivated" ? "deactivated" : "active";
  const search = searchParams.get("search") ?? "";
  const sort = searchParams.get("sort") === "oldest" ? "oldest" : "newest";
  const { data, error, loading, reload } = useApi<{ users: Profile[] }>("/admin/users");

  const [creating, setCreating] = useState(false);
  const [interacting, setInteracting] = useState<ReadonlySet<string>>(new Set());
  const resultsRef = useRef<HTMLDivElement>(null);
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
  const sortedUsers = [...visibleUsers].sort((left, right) => {
    const leftJoined = Date.parse(left.created_at ?? "");
    const rightJoined = Date.parse(right.created_at ?? "");
    if (!Number.isFinite(leftJoined)) return Number.isFinite(rightJoined) ? 1 : 0;
    if (!Number.isFinite(rightJoined)) return -1;
    return sort === "oldest" ? leftJoined - rightJoined : rightJoined - leftJoined;
  });
  const perPage = 20;
  const requestedPage = parsePage(searchParams.get("page") ?? "1", Number.MAX_SAFE_INTEGER) ?? 1;
  const page = Math.min(requestedPage, lastPage(visibleUsers.length, perPage));
  const pageUsers = sortedUsers.slice((page - 1) * perPage, page * perPage);
  const navigationLocked = creating || interacting.size > 0;
  const onInteractionChange = useCallback((id: string, active: boolean) => {
    setInteracting((previous) => {
      if (previous.has(id) === active) return previous;
      const next = new Set(previous);
      if (active) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  useEffect(() => {
    if (!data || loading || error || requestedPage === page) return;
    if (window.location.pathname !== "/admin/users") return;
    const next = new URLSearchParams(window.location.search);
    if ((parsePage(next.get("page") ?? "1", Number.MAX_SAFE_INTEGER) ?? 1) !== requestedPage) return;
    if (page === 1) next.delete("page");
    else next.set("page", String(page));
    setSearchParams(next, { replace: true });
  }, [data, loading, error, requestedPage, page, setSearchParams]);
  const countRows = data && !loading && !error ? searchedUsers.map((user) => ({ id: user.id, values: userFilterValues(user) })) : null;
  const counts = countFilterOptions(countRows, selected);
  // Choosing staff/admin also clears residency, so their counts reflect that action.
  const rolesWithoutResidency = countFilterOptions(countRows, { role: roleFilter, status: statusFilter }).role;
  const roleCounts = counts.role && rolesWithoutResidency ? {
    ...counts.role,
    values: new Map([...counts.role.values, ...["staff", "admin"].map((role): [string, number] => [role, rolesWithoutResidency.values.get(role) ?? 0])]),
  } : undefined;
  const filtered = Boolean(roleFilter || residencyFilter || statusFilter || query);

  function setFilter(name: "role" | "residency" | "status" | "search" | "sort", value: string) {
    // History updates before the next render; rapid control changes must compose.
    const next = new URLSearchParams(window.location.search);
    if ((name === "role" || name === "status") && !value) next.set(name, "all");
    else if ((name === "role" && value === "citizen") || (name === "status" && value === "active") || (name === "sort" && value === "newest")) next.delete(name);
    else if (value) next.set(name, value);
    else next.delete(name);
    next.delete("page");
    if (name === "role" && (value === "staff" || value === "admin")) next.delete("residency");
    setSearchParams(next, { replace: name === "search" });
  }

  function clearFilters() {
    const next = new URLSearchParams(window.location.search);
    for (const name of ["role", "residency", "status", "search", "page"]) next.delete(name);
    next.set("role", "all");
    next.set("status", "all");
    setSearchParams(next);
  }

  return (
    <div className="flex flex-col gap-6">
      <TableToolbar
        title="User accounts"
        description="Manage access, verify residents, and route staff to their areas."
        action={
          <Button ref={newAccountRef} type="button" variant="primary" disabled={navigationLocked}
            aria-expanded={creating} aria-controls={creating ? "new-account-form" : undefined} onClick={() => setCreating(true)}>
            New account
          </Button>
        }
        search={
          <Field label="Search" htmlFor="user-search">
            <Input id="user-search" disabled={navigationLocked} type="search" autoComplete="off" maxLength={100}
              placeholder="Name, email, or mobile…" value={search} onChange={(event) => setFilter("search", event.target.value)} />
          </Field>
        }
      >
        <ToolbarItem>
          <Field label="Role" htmlFor="role-filter">
            <Select id="role-filter" disabled={navigationLocked} value={roleFilter} onChange={(event) => setFilter("role", event.target.value)}>
              <FilterOption value="" label="Every role" counts={roleCounts} />
              {ROLES.map((role) => (
                <FilterOption key={role} value={role} label={ROLE_LABEL[role]} counts={roleCounts} />
              ))}
            </Select>
          </Field>
        </ToolbarItem>
        <ToolbarItem wide>
          <Field label="Residency" htmlFor="residency-filter">
            <Select id="residency-filter" value={residencyFilter} disabled={residencyDisabled || navigationLocked}
              aria-describedby="residency-filter-note" onChange={(event) => setFilter("residency", event.target.value)}>
              <FilterOption value="" label="Any residency" counts={counts.residency} />
              <FilterOption value="pending" label="Proof waiting for review" counts={counts.residency} />
              <FilterOption value="rejected" label="Proof rejected" counts={counts.residency} />
              <FilterOption value="verified" label="Verified resident" counts={counts.residency} />
            </Select>
          </Field>
          <span className={residencyDisabled ? "mt-1 block text-muted text-[12px]" : "sr-only"} id="residency-filter-note">
            Residency applies to citizens. Choose Every role or Citizen to use this filter.
          </span>
        </ToolbarItem>
        <ToolbarItem>
          <Field label="Account status" htmlFor="user-status-filter">
            <Select id="user-status-filter" disabled={navigationLocked} value={statusFilter} onChange={(event) => setFilter("status", event.target.value)}>
              <FilterOption value="" label="Any status" counts={counts.status} />
              <FilterOption value="active" label="Active" counts={counts.status} />
              <FilterOption value="deactivated" label="Deactivated" counts={counts.status} />
            </Select>
          </Field>
        </ToolbarItem>
        <ToolbarItem>
          <Field label="Date joined" htmlFor="user-joined-sort">
            <Select id="user-joined-sort" value={sort} disabled={navigationLocked} onChange={(event) => setFilter("sort", event.target.value)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
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

      {!loading && !error && data && <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="m-0 text-muted text-[13px]">{visibleUsers.length} {visibleUsers.length === 1 ? "account" : "accounts"} matching your filters</p>
        {filtered && <Button type="button" variant="ghost" disabled={navigationLocked} onClick={clearFilters}>Clear filters</Button>}
      </div>}
      {!loading && !error && visibleUsers.length === 0 && (
        <EmptyState title={filtered ? "No accounts match your filters" : "No user accounts yet"}>
          {filtered ? "Try another name, email, or mobile number, or clear the filters." : "Citizens appear here after registering. Use New account to add staff or an administrator."}
        </EmptyState>
      )}
      {!loading && !error && visibleUsers.length > 0 && (
        <div ref={resultsRef} className="relative overflow-x-auto" role="region" aria-label="User account columns" tabIndex={0}>
          <table className="table account-table w-full" role="table" aria-label="User accounts">
            <caption className="sr-only">User accounts matching the selected filters.</caption>
            <colgroup>
              <col className="account-col-name" />
              <col className="account-col-email" />
              <col className="account-col-phone" />
              <col className="account-col-joined" />
              <col className="account-col-role" />
              <col className="account-col-residency" />
              <col className="account-col-status" />
              <col className="account-col-actions" />
            </colgroup>
            <thead role="rowgroup">
              <tr role="row">
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Phone</th>
                <th scope="col">Date joined</th>
                <th scope="col">Role</th>
                <th scope="col">Residency</th>
                <th scope="col">Status</th>
                <th scope="col" className="account-actions">Actions</th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {pageUsers.map((user) => (
                <UserRow key={user.id} user={user} onDone={reload} onInteractionChange={onInteractionChange} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && !error && visibleUsers.length > 0 && <div className="flex flex-col gap-2">
        <NumberedPagination label="User accounts pagination" page={page} perPage={perPage} total={visibleUsers.length}
          disabled={navigationLocked} onPage={(nextPage) => {
            const next = new URLSearchParams(window.location.search);
            if (nextPage === 1) next.delete("page");
            else next.set("page", String(nextPage));
            setSearchParams(next);
            resultsRef.current?.scrollIntoView({ block: "start" });
          }} />
        {navigationLocked && <p className="m-0 text-muted text-[12px]">Close the open account panel before changing pages.</p>}
      </div>}
    </div>
  );
}

function UserRow({ user, onDone, onInteractionChange }: { user: Profile; onDone: () => void; onInteractionChange: (id: string, active: boolean) => void }) {
  const toast = useToast();
  const { user: currentUser } = useAuth();
  const [viewingDetails, setViewingDetails] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [confirmingActivation, setConfirmingActivation] = useState(false);
  // SW-1: a staff member's categories and barangays open in a row of their own.
  const [specializing, setSpecializing] = useState(false);
  const specializationsId = `specializations-row-${user.id}`;
  const [role, setRole] = useState<Role>(user.role);
  const active = user.is_active !== false;
  const awaitingReview = active && user.role === "citizen" && residencyStep(user) === "pending";
  const actions = useDisclosure();

  const isSelf = currentUser?.id === user.id;

  const { run, pending, error, setError } = useAction((body: { role?: Role; is_active?: boolean }) =>
    api.patch<{ user: Profile }>(`/admin/users/${user.id}`, body),
  );
  // UA-6 fallback while there is no SMS budget: a number confirmed by other means.
  const phone = useAction((verified: boolean) =>
    api.patch<{ user: Profile }>(`/admin/users/${user.id}/phone-verified`, { verified }),
  );
  useEffect(() => {
    onInteractionChange(user.id, viewingDetails || editing || reviewing || confirmingActivation || specializing || pending || phone.pending);
    return () => onInteractionChange(user.id, false);
  }, [user.id, viewingDetails, editing, reviewing, confirmingActivation, specializing, pending, phone.pending, onInteractionChange]);

  async function setPhoneVerified(verified: boolean) {
    if (phone.pending || pending) return;
    if (await phone.run(verified)) {
      setViewingDetails(false);
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
        <th scope="row" role="rowheader" className="account-identity">
          <span className="account-value" title={user.name}>{user.name}</span>
          {isSelf && <span className="account-secondary">Your account</span>}
        </th>
        <td role="cell" data-label="Email" className="account-email">
          <span className="account-value text-muted" title={user.email} translate="no">{user.email}</span>
        </td>
        <td role="cell" data-label="Phone" className="account-number">
          <span className={`account-value${user.contact_number ? "" : " text-muted"}`} title={user.contact_number ?? undefined} translate="no">
            {user.contact_number || "Not provided"}
          </span>
          {user.contact_number && <span className="account-secondary" aria-live="polite">{phone.pending ? "Saving…" : user.phone_verified_at ? "Confirmed by staff" : "Not confirmed"}</span>}
        </td>
        <td role="cell" data-label="Date joined" className="account-number">
          <span className="account-value text-muted">{formatJoinedDate(user.created_at)}</span>
        </td>
        <td role="cell" data-label="Role">
          <span className="tag tag-neutral">{ROLE_LABEL[user.role]}</span>
        </td>
        <td role="cell" data-label="Residency">
          <AccountResidency user={user} />
        </td>
        <td role="cell" data-label="Status">
          <StatusPill tone={active ? "success" : "neutral"}>{active ? "Active" : "Deactivated"}</StatusPill>
        </td>
        <td role="cell" data-label="Actions" className="account-actions">
          <div ref={actions.rootRef}>
            <Button type="button" variant="ghost" className="btn-icon account-action-trigger" disabled={pending || phone.pending}
              aria-busy={pending || phone.pending}
              aria-label={`Actions for ${user.name}`} title={`Actions for ${user.name}`} {...actions.triggerProps}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <circle cx="4" cy="10" r="1.5" /><circle cx="10" cy="10" r="1.5" /><circle cx="16" cy="10" r="1.5" />
              </svg>
            </Button>
            {actions.open && <AccountActionsPopover id={actions.panelId} triggerRef={actions.triggerProps.ref} onClose={actions.close}>
              <AccountAction icon="details" variant={active && !awaitingReview ? "primary" : "secondary"}
                onClick={() => { actions.close(true); setViewingDetails(true); }}>
                View details<span className="sr-only"> for {user.name}</span>
              </AccountAction>
              {user.role === "citizen" && <AccountAction icon="review" variant={awaitingReview ? "primary" : "secondary"}
                onClick={() => { actions.close(true); setReviewing(true); }}>
                Review residency<span className="sr-only"> of {user.name}</span>
              </AccountAction>}
              {user.role === "staff" && <AccountAction icon="routing" variant="secondary" aria-expanded={specializing}
                aria-controls={specializing ? specializationsId : undefined}
                onClick={() => { actions.close(true); setSpecializing((open) => !open); }}>
                {specializing ? "Close routing" : "Manage routing"}<span className="sr-only"> for {user.name}: specializations and areas</span>
              </AccountAction>}
              <hr className="account-actions-divider" />
              <AccountAction icon="role" variant="secondary" disabled={isSelf} aria-describedby={isSelf ? `self-restriction-${user.id}` : undefined}
                onClick={() => { actions.close(true); setRole(user.role); setError(null); setEditing(true); }}>
                Change role<span className="sr-only"> for {user.name}</span>
              </AccountAction>
              <AccountAction icon={active ? "deactivate" : "reactivate"} variant={active ? "danger-outline" : "primary"} disabled={isSelf}
                aria-describedby={isSelf ? `self-restriction-${user.id}` : undefined}
                onClick={() => { actions.close(true); setError(null); setConfirmingActivation(true); }}>
                {active ? "Deactivate" : "Reactivate"}<span className="sr-only"> {user.name}</span>
              </AccountAction>
              {isSelf && <p className="account-actions-note">Role and deactivation changes are unavailable for your own account.</p>}
            </AccountActionsPopover>}
          </div>
          {isSelf && <p id={`self-restriction-${user.id}`} className="sr-only">
            This is your own account. You cannot change your own role or deactivate it.
          </p>}
          {viewingDetails && <AccountDetails user={user} pending={phone.pending} error={phone.error}
            onPhoneVerify={() => { void setPhoneVerified(!user.phone_verified_at); }}
            onClose={() => { if (!phone.pending) { setViewingDetails(false); phone.setError(null); } }} />}
          {editing && <RoleChangeDialog user={user} role={role} pending={pending} error={error} onRoleChange={(next) => {
            setRole(next);
            setError(null);
          }} onClose={() => { if (!pending) { setRole(user.role); setEditing(false); setError(null); } }}
            onSave={() => { void save({ role }, `Role updated for ${user.name}.`); }} />}
          {reviewing && <ResidencyReview user={user} onClose={() => setReviewing(false)} onDone={() => { setReviewing(false); onDone(); }} />}
          {confirmingActivation && <ActivationConfirmation user={user} pending={pending} error={error?.message}
            onClose={() => { if (!pending) { setConfirmingActivation(false); setError(null); } }}
            onConfirm={async () => {
              if (await save({ is_active: !active }, `${user.name} ${active ? "deactivated" : "reactivated"}.`)) setConfirmingActivation(false);
            }} />}
        </td>
      </tr>
      {specializing && (
        <tr id={specializationsId} role="row" className="account-routing-row">
          <td role="cell" colSpan={8} className="bg-neutral-200/60">
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

function AccountResidency({ user }: { user: Profile }) {
  if (user.role !== "citizen") return <span className="text-muted">Not applicable</span>;
  const step = residencyStep(user);
  return <StatusPill tone={step === "verified" ? "success" : "warning"}>
    {step === "pending" ? "Awaiting review" : RESIDENCY_LABEL[step]}
  </StatusPill>;
}

const accountActionIcons = {
  details: <><rect x="3" y="3" width="18" height="18" rx="1" /><circle cx="9" cy="9" r="2" /><path d="M5 17c0-4 8-4 8 0M15 8h3M15 12h3M15 16h3" /></>,
  review: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></>,
  routing: <><path d="M5 20v-5c0-3 2-4 7-4s7-1 7-4V4M5 4v7M2 7l3-3 3 3M16 7l3-3 3 3" /></>,
  role: <><circle cx="9" cy="7" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5h4M17 9h4M18 15h3M19 13v4" /></>,
  deactivate: <><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></>,
  reactivate: <><circle cx="12" cy="12" r="9" /><path d="M8 12h8M12 8v8" /></>,
};

function AccountAction({ icon, children, className = "", ...props }: ComponentProps<typeof Button> & { icon: keyof typeof accountActionIcons }) {
  return <Button type="button" className={`account-action-item ${className}`} {...props}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {accountActionIcons[icon]}
    </svg>
    <span className="account-action-label">{children}</span>
  </Button>;
}

function AccountActionsPopover({ id, triggerRef, onClose, children }: {
  id: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: (restoreFocus?: boolean) => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const trigger = triggerRef.current;
    if (!panel || !trigger) return;
    panel.showPopover();
    const anchor = trigger.getBoundingClientRect();
    const bounds = panel.getBoundingClientRect();
    const style = getComputedStyle(panel);
    const inset = Number.parseFloat(style.getPropertyValue("--space-4"));
    const gap = Number.parseFloat(style.getPropertyValue("--space-2"));
    const left = Math.max(inset, Math.min(anchor.right - bounds.width, window.innerWidth - bounds.width - inset));
    const below = anchor.bottom + gap;
    const top = below + bounds.height <= window.innerHeight - inset ? below : Math.max(inset, anchor.top - gap - bounds.height);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
    const closeWithoutScrolling = () => {
      if (panel.contains(document.activeElement)) trigger.focus({ preventScroll: true });
      onClose();
    };
    const closeOnScroll = (event: Event) => {
      if (event.target instanceof Node && panel.contains(event.target)) return;
      const currentAnchor = trigger.getBoundingClientRect();
      if (currentAnchor.top !== anchor.top || currentAnchor.left !== anchor.left) closeWithoutScrolling();
    };
    window.addEventListener("resize", closeWithoutScrolling);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => {
      window.removeEventListener("resize", closeWithoutScrolling);
      window.removeEventListener("scroll", closeOnScroll, true);
      if (panel.matches(":popover-open")) panel.hidePopover();
    };
  }, [triggerRef, onClose]);

  return <div ref={panelRef} id={id} popover="manual" role="group" aria-label="Account actions" className="account-actions-menu"
    onBlur={(event) => {
      if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== triggerRef.current) onClose();
    }}>
    {children}
  </div>;
}

function AccountDetails({ user, pending, error, onPhoneVerify, onClose }: {
  user: Profile;
  pending: boolean;
  error: ApiError | null;
  onPhoneVerify: () => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const details: { label: string; value: ReactNode; wide?: boolean }[] = [
    { label: "Name", value: user.name, wide: true },
    { label: "Email", value: <span translate="no">{user.email}</span>, wide: true },
    { label: "Phone", wide: true, value: user.contact_number ? <div className="account-phone-verification">
      <div className="account-phone-status"><span translate="no">{user.contact_number}</span>
        <StatusPill tone={user.phone_verified_at ? "success" : "neutral"}>{user.phone_verified_at ? "Confirmed by staff" : "Not confirmed"}</StatusPill>
      </div>
      <p className="m-0 text-muted">Confirm this number after verifying it by another means.</p>
      <Button type="button" disabled={pending} aria-busy={pending} onClick={onPhoneVerify}>
        {pending ? "Saving…" : user.phone_verified_at ? "Mark phone not verified" : "Mark phone verified"}
      </Button>
      {error && <Alert title="Could not update phone verification">{error.message}</Alert>}
    </div> : "Not provided" },
    { label: "Date joined", value: formatJoinedDate(user.created_at) },
    { label: "Role", value: <span className="tag tag-neutral">{ROLE_LABEL[user.role]}</span> },
    { label: "Residency", value: <AccountResidency user={user} /> },
    { label: "Status", value: <StatusPill tone={user.is_active !== false ? "success" : "neutral"}>{user.is_active !== false ? "Active" : "Deactivated"}</StatusPill> },
  ];
  return <ModalDialog className="account-dialog" labelledBy={`account-details-title-${user.id}`} pending={pending} initialFocusRef={closeRef} onClose={onClose}>
    <h4 className="dialog-title" id={`account-details-title-${user.id}`}>Account details</h4>
    <dl className="account-details">
      {details.map(({ label, value, wide }) => <div key={label} className={wide ? "account-details-wide" : undefined}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
    <div className="dialog-actions"><Button ref={closeRef} type="button" disabled={pending} onClick={onClose}>Close</Button></div>
  </ModalDialog>;
}

function RoleChangeDialog({ user, role, pending, error, onRoleChange, onClose, onSave }: {
  user: Profile;
  role: Role;
  pending: boolean;
  error: ApiError | null;
  onRoleChange: (role: Role) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const selectRef = useRef<HTMLSelectElement>(null);
  return <ModalDialog className="account-dialog" labelledBy={`role-title-${user.id}`} pending={pending} initialFocusRef={selectRef} onClose={onClose}>
    <h4 className="dialog-title" id={`role-title-${user.id}`}>Change role for {user.name}</h4>
    <p className="account-current-role">Current role <span className="tag tag-neutral">{ROLE_LABEL[user.role]}</span></p>
    <form aria-label={`Change role for ${user.name}`} onSubmit={(event) => { event.preventDefault(); if (!pending && role !== user.role) onSave(); }}>
      <Field label="New role" htmlFor={`role-${user.id}`} error={error?.fieldErrors.role}>
        <select className="input" ref={selectRef} id={`role-${user.id}`} aria-label={`Role for ${user.name}`} value={role} disabled={pending}
          onChange={(event) => {
            const next = ROLES.find((value) => value === event.target.value);
            if (next) onRoleChange(next);
          }}>
          {ROLES.map((option) => <option key={option} value={option}>{ROLE_LABEL[option]}</option>)}
        </select>
      </Field>
      {error && <Alert title="Could not change role">{error.message}</Alert>}
      <div className="dialog-actions">
        <Button type="button" disabled={pending} onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={pending || role === user.role} aria-busy={pending}>{pending ? "Saving…" : "Save role"}</Button>
      </div>
    </form>
  </ModalDialog>;
}

function ActivationConfirmation({ user, pending, error, onClose, onConfirm }: {
  user: Profile;
  pending: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const active = user.is_active !== false;

  return (
    <ModalDialog className="account-dialog" labelledBy={`activation-title-${user.id}`} describedBy={`activation-description-${user.id}`}
      pending={pending} initialFocusRef={cancelRef} onClose={onClose}>
      <h4 className="dialog-title" id={`activation-title-${user.id}`}>{active ? "Deactivate" : "Reactivate"} {user.name}?</h4>
      <div className="dialog-body">
        <p id={`activation-description-${user.id}`} className="m-0">
          {active ? "This person will lose access to KAMOTI. Their reports and activity history will be kept." : "This person will be able to sign in again with their current role."}
        </p>
        <p className="mt-3 break-all text-[13px]">{user.email}</p>
        {error && <Alert title={`Could not ${active ? "deactivate" : "reactivate"} the account`}>{error}</Alert>}
      </div>
      <div className="dialog-actions flex-wrap">
        <Button ref={cancelRef} type="button" onClick={onClose} disabled={pending}>Cancel</Button>
        <Button type="button" variant={active ? "danger" : "primary"} disabled={pending} aria-busy={pending} onClick={onConfirm}>
          {pending ? "Saving…" : active ? "Deactivate account" : "Reactivate account"}
        </Button>
      </div>
    </ModalDialog>
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
      ...(canonicalSuffix(values.suffix) ? { suffix: canonicalSuffix(values.suffix) } : {}),
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

        <SuffixField id="new-suffix" value={values.suffix} error={shown.suffix}
          onChange={(suffix) => setValues((current) => ({ ...current, suffix }))} />

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

      <div className="flex flex-wrap justify-center gap-2">
        <Button type="submit" variant="primary" disabled={pending || invalid} aria-busy={pending}>
          {pending ? "Creating…" : "Create account"}
        </Button>
        <Button type="button" disabled={pending} onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
