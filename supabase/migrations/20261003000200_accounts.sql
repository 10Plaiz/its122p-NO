-- KAMOTI: account details, residency, and phone verification (UA-6, UA-7, UA-8)
--
-- profiles.name stays the one display name every screen reads; the API writes it
-- from the parts below. Existing rows are split once here. The parts are nullable
-- because legacy and staff accounts may not have them; the API requires them for
-- every new citizen.

begin;

alter table public.profiles
    add column first_name          text check (first_name  is null or length(btrim(first_name))  between 1 and 50),
    add column middle_name         text check (middle_name is null or length(btrim(middle_name)) between 1 and 50),
    add column last_name           text check (last_name   is null or length(btrim(last_name))   between 1 and 50),
    add column suffix              text check (suffix is null or suffix in ('Jr.', 'Sr.', 'II', 'III', 'IV', 'V')),
    -- Makati's 23 barangays after the 2023 EMBO transfer to Taguig. Mirrored by
    -- BARANGAYS in src/server/lib/validate.ts and src/web/lib/barangays.ts.
    add column barangay            text check (barangay is null or barangay in (
        'Bangkal', 'Bel-Air', 'Carmona', 'Dasmariñas', 'Forbes Park', 'Guadalupe Nuevo',
        'Guadalupe Viejo', 'Kasilawan', 'La Paz', 'Magallanes', 'Olympia', 'Palanan',
        'Pinagkaisahan', 'Pio del Pilar', 'Poblacion', 'San Antonio', 'San Isidro',
        'San Lorenzo', 'Santa Cruz', 'Singkamas', 'Tejeros', 'Urdaneta', 'Valenzuela')),
    add column address_line        text check (address_line is null or length(btrim(address_line)) between 1 and 200),
    -- When the registrant agreed to the Data Privacy Act (RA 10173) notice.
    add column privacy_consent_at  timestamptz,
    -- When the mobile number was confirmed, by a code or by an administrator.
    add column phone_verified_at   timestamptz,
    -- UA-8. Null for staff and admins, who are not residents being confirmed.
    add column residency_status    text check (residency_status is null or residency_status in ('pending', 'verified', 'rejected')),
    add column residency_proof_path text,
    add column residency_note      text check (residency_note is null or length(residency_note) <= 500),
    add column residency_reviewed_by uuid references public.profiles (id) on delete restrict,
    add column residency_reviewed_at timestamptz,
    add constraint profiles_residency_review_is_complete
        check ((residency_reviewed_at is null) = (residency_reviewed_by is null)),
    add constraint profiles_residency_rejection_has_note
        check (residency_status is distinct from 'rejected' or residency_note is not null);

-- Residents waiting for review, for the admin users screen.
create index profiles_residency_pending_idx
    on public.profiles (created_at) where residency_status = 'pending';

-- Backfill: last word as the last name, the rest as the first name. A one-word
-- name becomes the first name only. The trigger is off so this is not an edit.
alter table public.profiles disable trigger profiles_touch_updated_at;

update public.profiles
set first_name = case
        when btrim(name) ~ '\s' then regexp_replace(btrim(name), '\s+\S+$', '')
        else btrim(name)
    end,
    last_name = case
        when btrim(name) ~ '\s' then substring(btrim(name) from '\S+$')
        else null
    end
where first_name is null;

-- Existing citizens have not proven residency; an administrator can confirm them.
update public.profiles set residency_status = 'pending' where role = 'citizen' and residency_status is null;

alter table public.profiles enable trigger profiles_touch_updated_at;

-- ------------------------------------------------------------ proof storage

-- Private: proofs hold an address and often an ID number. No storage policies are
-- added, so only the API's service role can read or write them, and an
-- administrator sees one through a short-lived signed URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'residency-proofs',
    'residency-proofs',
    false,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

commit;
