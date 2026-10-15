# KAMOTI ERD (app tables only)

The database as implemented by the 22 migrations in
[`supabase/migrations/`](../../supabase/migrations/): the app's own tables in
the `public` schema. Supabase's `auth.users` table, which every `profiles` row
extends, is left out. Checked against those migrations on 2026-10-15: every
table and column below is created there, and nothing else is.

All 22 migrations are applied on the shared project: on 15 October 2026 a
dry run listed only `20261015000100_auth_rate_limits.sql`, which was then
pushed.

For the version that includes `auth.users`, see [ERD_with_auth.md](ERD_with_auth.md).

## How to use

1. Open [dbdiagram.io/d](https://dbdiagram.io/d).
2. Delete the sample code in the left panel.
3. Paste the whole DBML block below. The diagram renders on the right.
4. Drag tables to arrange them, then use **Export** for PNG, PDF, or SQL.

## DBML

```dbml
Project KAMOTI {
  database_type: 'PostgreSQL'
  Note: 'Key Alert and Monitoring for Online Tracking of Infrastructures. Supabase (PostgreSQL 15+).'
}

// ------------------------------------------------------------ enumerations

Enum user_role {
  admin
  staff
  citizen
}

Enum report_status {
  pending
  under_review
  in_progress
  resolved
  cancelled [note: 'Dead end, reachable only by the filing citizen while pending']
  rejected [note: 'Approved closure request with a public reason']
}

Enum photo_kind {
  initial
  resolution
}

Enum update_type {
  status_change
  assignment
  remark
  photo
  edit
  closure_request
  verification
}

// ------------------------------------------------------------ people

Table profiles {
  id uuid [pk, note: 'Same id as the Supabase Auth user (auth.users.id)']
  name text [not null, note: 'Composed display name']
  email citext [not null, unique]
  role user_role [not null, default: 'citizen']
  contact_number text [note: '11 digits starting 09 (API rule)']
  is_active boolean [not null, default: true, note: 'Accounts are closed here, never deleted']
  first_name text [note: '1-50 characters']
  middle_name text [note: '1-50 characters']
  last_name text [note: '1-50 characters']
  suffix text [note: 'Jr. | Sr. | II | III | IV | V']
  barangay text [note: 'One of Makati\'s 23 barangays']
  address_line text [note: '1-200 characters']
  privacy_consent_at timestamptz
  phone_verified_at timestamptz [note: 'Cleared when the number changes']
  residency_status text [note: 'pending | verified | rejected; null for Staff and Administrators']
  residency_proof_path text [note: 'Object key in the private residency-proofs bucket']
  residency_proof_id uuid [note: 'Set together with residency_proof_path']
  residency_note text [note: 'Up to 500 characters; required when rejected']
  residency_reviewed_by uuid
  residency_reviewed_at timestamptz [note: 'Set together with residency_reviewed_by']
  residency_review_version uuid [not null, default: `gen_random_uuid()`, note: 'Changes with any reviewed fact; a decision must quote it']
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  indexes {
    role [name: 'profiles_role_idx', note: 'Partial: WHERE is_active']
    created_at [name: 'profiles_residency_pending_idx', note: 'Partial: WHERE residency_status = pending']
    residency_proof_id [name: 'profiles_residency_proof_idx', note: 'Partial: WHERE residency_proof_id IS NOT NULL']
  }

  Note: 'Application fields for each Supabase Auth user.'
}

Table residency_proof_versions {
  id uuid [pk, note: 'The proof identity']
  user_id uuid [not null]
  object_path text [not null, unique]
  sha256 text [note: '64 hex characters; null for proofs uploaded before this table']
  created_at timestamptz [not null, default: `clock_timestamp()`]
  superseded_at timestamptz [note: 'The only column that may change']

  indexes {
    (id, user_id, object_path) [unique]
    (user_id, created_at) [name: 'residency_proof_versions_user_idx']
  }

  Note: 'Every proof ever attached to an account. Rows are never deleted. Service role only.'
}

Table staff_specializations {
  staff_id uuid [pk]
  category_id bigint [pk]
  is_active boolean [not null, default: true]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  indexes {
    category_id [name: 'staff_specializations_category_idx', note: 'Partial: WHERE is_active']
  }
}

Table staff_areas {
  staff_id uuid [pk]
  barangay text [pk]
  is_active boolean [not null, default: true]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  indexes {
    barangay [name: 'staff_areas_barangay_idx', note: 'Partial: WHERE is_active']
  }
}

// ------------------------------------------------------------ reference data

Table categories {
  id bigint [pk, increment]
  name text [not null, unique]
  description text
  is_active boolean [not null, default: true]
  created_at timestamptz [not null, default: `now()`]
}

Table problem_types {
  id bigint [pk, increment]
  category_id bigint [not null]
  name text [not null]
  is_active boolean [not null, default: true]
  created_at timestamptz [not null, default: `now()`]

  indexes {
    (category_id, name) [unique, name: 'problem_types_category_name_key']
    (id, category_id) [unique, name: 'problem_types_id_category_key']
    category_id [name: 'problem_types_category_idx', note: 'Partial: WHERE is_active']
  }
}

Table barangays {
  name text [pk]
  osm_id bigint [not null, note: 'OpenStreetMap relation id']
  boundary polygon [not null]

  Note: 'Makati barangay boundaries. A report\'s barangay is derived from its pin.'
}

// ------------------------------------------------------------ reports

Table reports {
  id uuid [pk, default: `gen_random_uuid()`]
  reference_code text [not null, unique, note: 'KMT-<year>-<6-digit sequence>, set by trigger']
  citizen_id uuid [not null]
  category_id bigint [not null]
  primary_problem_id bigint [note: 'Must belong to category_id']
  secondary_problem_id bigint [note: 'Needs a primary; must differ from it']
  assigned_staff_id uuid
  assigned_at timestamptz
  title text [not null, note: '3-150 characters']
  description text [not null, note: 'At least 10 characters']
  latitude "numeric(9,6)" [not null, note: '14.5276 to 14.5816 (Makati box)']
  longitude "numeric(9,6)" [not null, note: '120.9967 to 121.0521 (Makati box)']
  address_text text
  barangay text [note: 'Set from the pin by trigger']
  status report_status [not null, default: 'pending']
  status_changed_at timestamptz [not null, default: `now()`]
  is_public boolean [not null, default: false, note: 'Only reviewed reports reach the public board']
  closure_requested_at timestamptz [note: 'The four closure_* columns are all set or all null']
  closure_requested_by uuid
  closure_outcome text [note: 'resolved | rejected']
  closure_reason text
  verified_by uuid [note: 'The approving Administrator']
  verified_at timestamptz [note: 'Needs a closure request']
  submitted_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]
  resolved_at timestamptz [note: 'Set if and only if status = resolved']

  indexes {
    (citizen_id, submitted_at) [name: 'reports_citizen_idx']
    (assigned_staff_id, status) [name: 'reports_staff_idx', note: 'Partial: WHERE assigned_staff_id IS NOT NULL']
    (status, submitted_at) [name: 'reports_status_idx']
    category_id [name: 'reports_category_idx']
    (latitude, longitude) [name: 'reports_location_idx']
    submitted_at [name: 'reports_public_idx', note: 'Partial: WHERE is_public']
    primary_problem_id [name: 'reports_primary_problem_idx', note: 'Partial: WHERE NOT NULL']
    secondary_problem_id [name: 'reports_secondary_problem_idx', note: 'Partial: WHERE NOT NULL']
    closure_requested_at [name: 'reports_closure_pending_idx', note: 'Partial: requested and not verified']
    barangay [name: 'reports_barangay_idx']
  }
}

Table report_photos {
  id uuid [pk, default: `gen_random_uuid()`]
  report_id uuid [not null]
  kind photo_kind [not null, default: 'initial']
  storage_path text [not null, note: 'Object key in the report-photos Storage bucket']
  uploaded_by uuid [not null]
  created_at timestamptz [not null, default: `now()`]
  purged_at timestamptz [note: 'Set when the retention purge removed the file; the row stays']

  indexes {
    (report_id, kind) [name: 'report_photos_report_idx']
    report_id [name: 'report_photos_unpurged_idx', note: 'Partial: WHERE purged_at IS NULL']
  }
}

Table report_updates {
  id uuid [pk, default: `gen_random_uuid()`]
  report_id uuid [not null]
  updated_by uuid [not null]
  update_type update_type [not null]
  previous_status report_status [note: 'Required when update_type = status_change']
  new_status report_status [note: 'Required when update_type = status_change']
  details text
  created_at timestamptz [not null, default: `now()`]

  indexes {
    (report_id, created_at) [name: 'report_updates_report_idx']
  }

  Note: 'Per-report audit history.'
}

Table report_inspections {
  id bigint [pk, increment]
  report_id uuid [not null]
  inspector_id uuid [not null]
  severity text [not null, note: 'low | medium | high']
  findings text [not null]
  inspected_at timestamptz [not null, default: `now()`]
  created_at timestamptz [not null, default: `now()`]

  indexes {
    (report_id, inspected_at) [name: 'report_inspections_report_idx']
    (inspector_id, inspected_at) [name: 'report_inspections_inspector_idx']
  }

  Note: 'Staff assessments. Table exists; no API endpoint uses it yet.'
}

Table report_feedback {
  id uuid [pk, default: `gen_random_uuid()`]
  report_id uuid [not null, unique, note: 'One rating per report']
  citizen_id uuid [not null]
  staff_id uuid [note: 'The assignee when the rating was given']
  rating smallint [not null, note: '1-5']
  comment text [note: 'Up to 500 characters, not blank']
  created_at timestamptz [not null, default: `now()`]

  indexes {
    (staff_id, created_at) [name: 'report_feedback_staff_idx', note: 'Partial: WHERE staff_id IS NOT NULL']
  }
}

// ------------------------------------------------------------ notices and logs

Table notifications {
  id uuid [pk, default: `gen_random_uuid()`]
  user_id uuid [not null]
  report_id uuid
  message text [not null]
  is_read boolean [not null, default: false]
  created_at timestamptz [not null, default: `now()`]

  indexes {
    (user_id, created_at) [name: 'notifications_inbox_idx']
    user_id [name: 'notifications_unread_idx', note: 'Partial: WHERE NOT is_read']
  }
}

Table activity_logs {
  id bigint [pk, increment]
  actor_id uuid
  action text [not null, note: 'e.g. user.role_changed, category.created']
  entity_type text
  entity_id text
  metadata jsonb [not null, default: '{}']
  ip_address inet
  created_at timestamptz [not null, default: `now()`]

  indexes {
    created_at [name: 'activity_logs_recent_idx']
    (actor_id, created_at) [name: 'activity_logs_actor_idx']
  }

  Note: 'System-wide audit log.'
}

Table citizen_submission_events {
  id bigint [pk, increment]
  operation text [not null, note: 'report | photo | proof']
  scope text [not null, note: 'account | network']
  subject_key text [not null, note: '1-128 characters']
  admitted_at timestamptz [not null]
  expires_at timestamptz [not null, note: 'admitted_at + 1 hour']

  indexes {
    (operation, scope, subject_key, admitted_at, id) [name: 'citizen_submission_events_subject_idx']
    (expires_at, id) [name: 'citizen_submission_events_expiry_idx']
  }

  Note: 'Shared quota ledger. Expired rows are removed in bounded batches. Service role only; no foreign keys.'
}

Table auth_rate_counters {
  key text [pk, note: 'SHA-256 of the limit name and its subject (client, email, or account)']
  hits integer [not null, note: '0-100000']
  reset_at timestamptz [not null, note: 'End of the fixed window']

  indexes {
    reset_at [name: 'auth_rate_counters_reset_idx']
  }

  Note: 'Shared sign-in, code, refresh, and comment limits (KI-14). Expired rows are removed in bounded batches. Service role only; no foreign keys.'
}

// ------------------------------------------------------------- relationships

Ref profile_reviewer: profiles.residency_reviewed_by > profiles.id [delete: restrict]
Ref profile_current_proof: profiles.(residency_proof_id, id, residency_proof_path) > residency_proof_versions.(id, user_id, object_path) [delete: restrict]
Ref proof_owner: residency_proof_versions.user_id > profiles.id [delete: restrict]

Ref specialization_staff: staff_specializations.staff_id > profiles.id [delete: restrict]
Ref specialization_category: staff_specializations.category_id > categories.id [delete: restrict]
Ref area_staff: staff_areas.staff_id > profiles.id [delete: restrict]
Ref area_barangay: staff_areas.barangay > barangays.name [delete: restrict]

Ref problem_category: problem_types.category_id > categories.id [delete: restrict]

Ref report_citizen: reports.citizen_id > profiles.id [delete: restrict]
Ref report_category: reports.category_id > categories.id [delete: restrict]
Ref report_primary_problem: reports.(primary_problem_id, category_id) > problem_types.(id, category_id) [delete: restrict]
Ref report_secondary_problem: reports.(secondary_problem_id, category_id) > problem_types.(id, category_id) [delete: restrict]
Ref report_assigned_staff: reports.assigned_staff_id > profiles.id [delete: restrict]
Ref report_barangay: reports.barangay > barangays.name [delete: restrict]
Ref report_closure_requester: reports.closure_requested_by > profiles.id [delete: restrict]
Ref report_verifier: reports.verified_by > profiles.id [delete: restrict]

Ref photo_report: report_photos.report_id > reports.id [delete: restrict]
Ref photo_uploader: report_photos.uploaded_by > profiles.id [delete: restrict]

Ref update_report: report_updates.report_id > reports.id [delete: restrict]
Ref update_author: report_updates.updated_by > profiles.id [delete: restrict]

Ref inspection_report: report_inspections.report_id > reports.id [delete: restrict]
Ref inspection_inspector: report_inspections.inspector_id > profiles.id [delete: restrict]

Ref feedback_report: report_feedback.report_id - reports.id [delete: restrict]
Ref feedback_citizen: report_feedback.citizen_id > profiles.id [delete: restrict]
Ref feedback_staff: report_feedback.staff_id > profiles.id [delete: restrict]

Ref notification_recipient: notifications.user_id > profiles.id [delete: restrict]
Ref notification_report: notifications.report_id > reports.id [delete: restrict]

Ref log_actor: activity_logs.actor_id > profiles.id [delete: restrict]
```

## Notes

- **Supabase Auth:** each `profiles.id` is also a Supabase Auth user id
  (`auth.users.id`, not drawn). Deleting that Auth user in the dashboard fails;
  close the account with `is_active = false` instead.
- **Rows are never deleted.** Every foreign key restricts deletes
  (`20261003000100_no_delete.sql`). Records are retired with `is_active` or the
  `cancelled` status. Only the image files of long-cancelled reports are
  removed; their `report_photos` rows stay, stamped with `purged_at`.
- **`profiles` plays several roles on `reports`:** the citizen who filed it, the
  assigned staff member, the staff member who requested closure, and the
  Administrator who verified it. Photos, updates, inspections, and feedback
  record whoever else acted on it.
- **Composite keys:** a report's problem types must belong to its category, and
  a profile's current proof must belong to that profile.
- **Triggers:** `reports_set_barangay` derives `reports.barangay` from the pin.
  `profiles_version_residency_review` changes `residency_review_version` and
  returns residency to pending when a reviewed fact changes.
  `residency_proof_versions_immutable` refuses deletes and every change except
  setting `superseded_at` once. `reports_set_reference_code` sets the
  reference code, and `touch_updated_at` triggers keep `updated_at` current.
- **Not drawn:** the `public_reports` view (reviewed, non-cancelled reports
  joined to their category, barangay, approved rejection reason, and photos,
  with no citizen details). DBML has no view type. Database functions are
  described in [ARCHITECTURE.md](../ARCHITECTURE.md#database-behavior).
