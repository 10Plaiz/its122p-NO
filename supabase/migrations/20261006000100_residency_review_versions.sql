begin;

alter table public.profiles
    add column residency_review_version uuid not null default gen_random_uuid(),
    add column residency_proof_id uuid;

create table public.residency_proof_versions (
    id uuid primary key,
    user_id uuid not null references public.profiles(id) on delete restrict,
    object_path text not null unique check (length(btrim(object_path)) > 0),
    sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
    created_at timestamptz not null default clock_timestamp(),
    superseded_at timestamptz,
    unique (id, user_id, object_path),
    check (superseded_at is null or superseded_at >= created_at)
);
create index residency_proof_versions_user_idx on public.residency_proof_versions(user_id, created_at);
alter table public.residency_proof_versions enable row level security;
revoke all on table public.residency_proof_versions from public, anon, authenticated, service_role;
grant select, insert on table public.residency_proof_versions to service_role;
grant update (superseded_at) on table public.residency_proof_versions to service_role;

alter table public.profiles disable trigger profiles_touch_updated_at;
update public.profiles set residency_proof_id = gen_random_uuid() where residency_proof_path is not null;
insert into public.residency_proof_versions (id, user_id, object_path, created_at)
select residency_proof_id, id, residency_proof_path, created_at
from public.profiles where residency_proof_id is not null;
alter table public.profiles enable trigger profiles_touch_updated_at;

alter table public.profiles
    add constraint profiles_residency_proof_pair check ((residency_proof_id is null) = (residency_proof_path is null)),
    add constraint profiles_residency_proof_identity foreign key (residency_proof_id, id, residency_proof_path)
        references public.residency_proof_versions(id, user_id, object_path) on delete restrict;
create index profiles_residency_proof_idx on public.profiles(residency_proof_id) where residency_proof_id is not null;

create function public.guard_residency_proof_version() returns trigger
language plpgsql security invoker set search_path = '' as $fn$
begin
    if tg_op = 'DELETE' then
        raise sqlstate 'PT400' using message = 'Proof versions must be retained.';
    end if;
    if row(new.id, new.user_id, new.object_path, new.sha256, new.created_at)
        is distinct from row(old.id, old.user_id, old.object_path, old.sha256, old.created_at)
        or (old.superseded_at is not null and new.superseded_at is distinct from old.superseded_at) then
        raise sqlstate 'PT400' using message = 'Proof identity and content cannot be changed.';
    end if;
    return new;
end;
$fn$;
create trigger residency_proof_versions_immutable before update or delete on public.residency_proof_versions
    for each row execute function public.guard_residency_proof_version();

create function public.version_residency_review() returns trigger
language plpgsql security invoker set search_path = '' as $fn$
declare
    identity_changed boolean;
    proof_changed boolean;
begin
    identity_changed := row(new.name, new.first_name, new.middle_name, new.last_name, new.suffix, new.barangay, new.address_line)
        is distinct from row(old.name, old.first_name, old.middle_name, old.last_name, old.suffix, old.barangay, old.address_line);
    proof_changed := row(new.residency_proof_id, new.residency_proof_path)
        is distinct from row(old.residency_proof_id, old.residency_proof_path);
    if proof_changed or (identity_changed and old.residency_status in ('pending', 'verified')) then
        new.residency_status := 'pending';
        new.residency_note := null;
        new.residency_reviewed_by := null;
        new.residency_reviewed_at := null;
    end if;
    if identity_changed or proof_changed or row(new.role, new.is_active, new.residency_status,
        new.residency_note, new.residency_reviewed_by, new.residency_reviewed_at)
        is distinct from row(old.role, old.is_active, old.residency_status,
            old.residency_note, old.residency_reviewed_by, old.residency_reviewed_at) then
        new.residency_review_version := gen_random_uuid();
    else
        new.residency_review_version := old.residency_review_version;
    end if;
    if proof_changed and old.residency_proof_id is not null then
        update public.residency_proof_versions set superseded_at = coalesce(superseded_at, clock_timestamp())
        where id = old.residency_proof_id;
    end if;
    return new;
end;
$fn$;
create trigger profiles_version_residency_review before update on public.profiles
    for each row execute function public.version_residency_review();

create function public.complete_residency_proof(
    p_user_id uuid, p_submission_id uuid, p_object_path text, p_sha256 text,
    p_expected_version uuid, p_ip inet default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $fn$
declare
    u public.profiles%rowtype;
    proof public.residency_proof_versions%rowtype;
begin
    select * into u from public.profiles where id = p_user_id for update;
    if not found then raise sqlstate 'PT404' using message = 'Your account does not exist.'; end if;
    if u.role <> 'citizen' or not u.is_active then
        raise sqlstate 'PT403' using message = 'Only active citizens can upload residency proof.';
    end if;
    if p_submission_id is null or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
        or p_object_path is null or p_object_path !~ ('^' || p_user_id::text || '/' || p_submission_id::text || '\.(jpg|png|webp|pdf)$') then
        raise sqlstate 'PT400' using message = 'The proof identity, path, or content hash is invalid.';
    end if;
    select * into proof from public.residency_proof_versions where id = p_submission_id;
    if found then
        if row(proof.user_id, proof.object_path, proof.sha256) is distinct from row(p_user_id, p_object_path, p_sha256) then
            raise sqlstate 'PT409' using message = 'This submission has different proof content. Start a new submission.';
        end if;
        return (to_jsonb(u) - 'residency_proof_path') || jsonb_build_object('has_residency_proof', u.residency_proof_id is not null);
    end if;
    if p_expected_version is null then raise sqlstate 'PT400' using message = 'The current residency review version is required.'; end if;
    if u.residency_review_version <> p_expected_version then
        raise sqlstate 'PT409' using message = 'Your residency details changed. Refresh your account before you upload again.';
    end if;
    if u.residency_status = 'verified' then
        raise sqlstate 'PT400' using message = 'Your residency is already confirmed. There is nothing more to upload.';
    end if;
    perform 1 from storage.objects where bucket_id = 'residency-proofs' and name = p_object_path for share;
    if not found then raise sqlstate 'PT409' using message = 'The proof object is missing. Upload the proof before you try again.'; end if;
    insert into public.residency_proof_versions (id, user_id, object_path, sha256)
    values (p_submission_id, p_user_id, p_object_path, p_sha256);
    update public.profiles set residency_proof_id = p_submission_id, residency_proof_path = p_object_path,
        residency_status = 'pending', residency_note = null, residency_reviewed_by = null, residency_reviewed_at = null
    where id = u.id returning * into u;
    insert into public.activity_logs (actor_id, action, entity_type, entity_id, metadata, ip_address)
    values (u.id, 'residency.uploaded', 'user', u.id::text,
        jsonb_build_object('proof_id', u.residency_proof_id, 'review_version', u.residency_review_version), p_ip);
    return (to_jsonb(u) - 'residency_proof_path') || jsonb_build_object('has_residency_proof', true);
end;
$fn$;

create function public.update_own_profile(p_user_id uuid, p_input jsonb, p_ip inet default null) returns jsonb
language plpgsql security invoker set search_path = '' as $fn$
declare
    u public.profiles%rowtype;
    changed public.profiles%rowtype;
    metadata jsonb := jsonb_build_object('by', 'self');
begin
    select * into u from public.profiles where id = p_user_id for update;
    if not found then raise sqlstate 'PT404' using message = 'Your account does not exist.'; end if;
    if u.role <> 'citizen' or not u.is_active then
        raise sqlstate 'PT403' using message = 'Only active citizens can change their account details.';
    end if;
    if p_input is null or jsonb_typeof(p_input) <> 'object' or p_input - array[
        'name', 'first_name', 'middle_name', 'last_name', 'suffix', 'contact_number', 'barangay', 'address_line'
    ] <> '{}'::jsonb then raise sqlstate 'PT400' using message = 'Unexpected account fields.'; end if;
    changed := jsonb_populate_record(u, p_input);
    update public.profiles set name = changed.name, first_name = changed.first_name,
        middle_name = changed.middle_name, last_name = changed.last_name, suffix = changed.suffix,
        contact_number = changed.contact_number, barangay = changed.barangay, address_line = changed.address_line,
        phone_verified_at = case when changed.contact_number is distinct from u.contact_number then null else u.phone_verified_at end
    where id = u.id returning * into changed;
    if changed.contact_number is distinct from u.contact_number then
        metadata := metadata || jsonb_build_object('contact_number', jsonb_build_object('from', u.contact_number, 'to', changed.contact_number));
    end if;
    if row(changed.barangay, changed.address_line) is distinct from row(u.barangay, u.address_line) then
        metadata := metadata || jsonb_build_object('barangay', changed.barangay, 'residency_review', changed.residency_status = 'pending');
    end if;
    insert into public.activity_logs (actor_id, action, entity_type, entity_id, metadata, ip_address)
    values (u.id, 'user.updated', 'user', u.id::text, metadata, p_ip);
    return (to_jsonb(changed) - 'residency_proof_path') || jsonb_build_object('has_residency_proof', changed.residency_proof_id is not null);
end;
$fn$;

revoke all on function public.guard_residency_proof_version(), public.version_residency_review(),
    public.complete_residency_proof(uuid, uuid, text, text, uuid, inet), public.update_own_profile(uuid, jsonb, inet)
from public, anon, authenticated;
grant execute on function public.guard_residency_proof_version(), public.version_residency_review(),
    public.complete_residency_proof(uuid, uuid, text, text, uuid, inet), public.update_own_profile(uuid, jsonb, inet)
to service_role;

create or replace function public.admin_create_profile(
    p_actor_id uuid, p_user_id uuid, p_input jsonb, p_ip inet default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $fn$
declare
    u public.profiles%rowtype;
begin
    perform 1 from public.profiles where id = p_actor_id and role = 'admin' and is_active for share;
    if not found then raise sqlstate 'PT403' using message = 'Only active administrators can create accounts.'; end if;
    if p_input is null or jsonb_typeof(p_input) <> 'object' or p_input - array[
        'name', 'first_name', 'middle_name', 'last_name', 'suffix', 'email', 'role', 'contact_number'
    ] <> '{}'::jsonb then
        raise sqlstate 'PT400' using message = 'Unexpected account fields.';
    end if;
    insert into public.profiles (id, name, first_name, middle_name, last_name, suffix, email, role, contact_number, residency_status)
    values (p_user_id, p_input->>'name', p_input->>'first_name', p_input->>'middle_name', p_input->>'last_name',
        p_input->>'suffix', p_input->>'email', (p_input->>'role')::public.user_role, p_input->>'contact_number',
        case when p_input->>'role' = 'citizen' then 'pending' else null end) returning * into u;
    insert into public.activity_logs (actor_id, action, entity_type, entity_id, metadata, ip_address)
    values (p_actor_id, 'user.created', 'user', u.id::text, jsonb_build_object('role', u.role), p_ip);
    return (to_jsonb(u) - 'residency_proof_path') || jsonb_build_object('has_residency_proof', false, 'reviewer', null);
end;
$fn$;
revoke all on function public.admin_create_profile(uuid, uuid, jsonb, inet) from public, anon, authenticated;
grant execute on function public.admin_create_profile(uuid, uuid, jsonb, inet) to service_role;

create or replace function public.admin_change_profile(
    p_actor_id uuid, p_user_id uuid, p_action text, p_input jsonb, p_ip inet default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $fn$
declare
    u public.profiles%rowtype;
    changed public.profiles%rowtype;
    audit_metadata jsonb := '{}'::jsonb;
    reviewer jsonb;
    expected_version uuid;
begin
    perform 1 from public.profiles where id = p_actor_id and role = 'admin' and is_active for share;
    if not found then raise sqlstate 'PT403' using message = 'Only active administrators can change accounts.'; end if;
    select * into u from public.profiles where id = p_user_id for update;
    if not found then raise sqlstate 'PT404' using message = 'That user does not exist.'; end if;
    if p_input is null or jsonb_typeof(p_input) <> 'object' then
        raise sqlstate 'PT400' using message = 'Account changes must be an object.';
    end if;

    if p_action = 'user.updated' then
        if p_input - array['name', 'first_name', 'middle_name', 'last_name', 'suffix', 'role', 'contact_number', 'is_active'] <> '{}'::jsonb then
            raise sqlstate 'PT400' using message = 'These account fields cannot be changed here.';
        end if;
        if p_actor_id = p_user_id and (p_input ? 'role' or p_input @> '{"is_active":false}'::jsonb) then
            raise sqlstate 'PT400' using message = 'You cannot change your own role or deactivate your own account.';
        end if;
        changed := jsonb_populate_record(u, p_input);
        update public.profiles set name = changed.name, first_name = changed.first_name,
            middle_name = changed.middle_name, last_name = changed.last_name, suffix = changed.suffix,
            role = changed.role, contact_number = changed.contact_number, is_active = changed.is_active,
            phone_verified_at = case when p_input ? 'contact_number' then null else u.phone_verified_at end
        where id = u.id returning * into changed;
        audit_metadata := p_input || case when p_input ? 'role' then jsonb_build_object('previous_role', u.role) else '{}'::jsonb end;
    elsif p_action = 'residency.reviewed' then
        if p_input - array['decision', 'note', 'expected_version'] <> '{}'::jsonb
           or (p_input->>'decision') is null or p_input->>'decision' not in ('verified', 'rejected') then
            raise sqlstate 'PT400' using message = 'Choose whether to accept or reject the proof.';
        end if;
        if jsonb_typeof(p_input->'expected_version') is distinct from 'string' then
            raise sqlstate 'PT400' using message = 'The current residency review version is required.';
        end if;
        begin
            expected_version := (p_input->>'expected_version')::uuid;
        exception when invalid_text_representation then
            raise sqlstate 'PT400' using message = 'The residency review version must be a UUID.';
        end;
        if u.residency_review_version <> expected_version then
            raise sqlstate 'PT409' using message = 'These residency details changed. Refresh the review before you decide.';
        end if;
        if u.role <> 'citizen' then raise sqlstate 'PT400' using message = 'Only citizens have a residency to confirm.'; end if;
        if p_input->>'decision' = 'rejected' then
            if u.residency_proof_path is null then raise sqlstate 'PT400' using message = 'There is no proof to reject.'; end if;
            if p_input->>'note' is null or length(btrim(p_input->>'note')) not between 5 and 500 then
                raise sqlstate 'PT400' using message = 'Say why the proof was not accepted.';
            end if;
        end if;
        update public.profiles set residency_status = p_input->>'decision',
            residency_note = case when p_input->>'decision' = 'rejected' then btrim(p_input->>'note') else null end,
            residency_reviewed_by = p_actor_id, residency_reviewed_at = clock_timestamp()
        where id = u.id returning * into changed;
        audit_metadata := jsonb_build_object('decision', changed.residency_status, 'note', changed.residency_note,
            'expected_version', expected_version, 'residency_review_version', u.residency_review_version,
            'residency_proof_id', u.residency_proof_id, 'name', u.name, 'first_name', u.first_name,
            'middle_name', u.middle_name, 'last_name', u.last_name, 'suffix', u.suffix,
            'barangay', u.barangay, 'address_line', u.address_line, 'role', u.role, 'is_active', u.is_active);
        insert into public.notifications (user_id, message) values (u.id,
            case when changed.residency_status = 'verified' then
                'Your proof of residency was accepted. Your reports no longer show "Unverified resident".'
            else 'Your proof of residency was not accepted: ' || changed.residency_note ||
                ' Upload a new proof to continue using KAMOTI.' end);
    elsif p_action in ('user.phone_verified', 'user.phone_unverified') then
        if p_input <> '{}'::jsonb then raise sqlstate 'PT400' using message = 'Unexpected mobile verification fields.'; end if;
        if p_action = 'user.phone_verified' and u.contact_number is null then
            raise sqlstate 'PT400' using message = 'This account has no mobile number to verify.';
        end if;
        update public.profiles set phone_verified_at = case when p_action = 'user.phone_verified' then clock_timestamp() else null end
        where id = u.id returning * into changed;
    else
        raise sqlstate 'PT400' using message = 'That account action is not supported.';
    end if;

    insert into public.activity_logs (actor_id, action, entity_type, entity_id, metadata, ip_address)
    values (p_actor_id, p_action, 'user', u.id::text, audit_metadata, p_ip);
    if changed.residency_reviewed_by is not null then
        select jsonb_build_object('id', id, 'name', name) into reviewer
        from public.profiles where id = changed.residency_reviewed_by;
    end if;
    return jsonb_build_object('id', changed.id, 'name', changed.name,
        'first_name', changed.first_name, 'middle_name', changed.middle_name, 'last_name', changed.last_name,
        'suffix', changed.suffix, 'email', changed.email, 'role', changed.role,
        'contact_number', changed.contact_number, 'phone_verified_at', changed.phone_verified_at,
        'barangay', changed.barangay, 'address_line', changed.address_line,
        'residency_status', changed.residency_status, 'residency_note', changed.residency_note,
        'is_active', changed.is_active, 'created_at', changed.created_at,
        'residency_reviewed_at', changed.residency_reviewed_at, 'reviewer', reviewer,
        'has_residency_proof', changed.residency_proof_path is not null,
        'residency_proof_id', changed.residency_proof_id, 'residency_review_version', changed.residency_review_version);
end;
$fn$;
revoke all on function public.admin_change_profile(uuid, uuid, text, jsonb, inet) from public, anon, authenticated;
grant execute on function public.admin_change_profile(uuid, uuid, text, jsonb, inet) to service_role;
commit;
