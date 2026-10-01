# KAMOTI ERD (app tables only)

The database as implemented by the migrations in
[`supabase/migrations/`](supabase/migrations/): the app's own tables in the
`public` schema. Supabase's `auth.users` table, which every `profiles` row
extends, is left out. Checked against the live
test project on 2026-09-28: every table and column below exists there, and
nothing else does.

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
}

// ------------------------------------------------------------ app tables

Table profiles {
  id uuid [pk, note: 'Same id as the Supabase Auth user (auth.users.id)']
  name text [not null, note: 'Letters, spaces, . \' - only (API rule)']
  email citext [not null, unique]
  role user_role [not null, default: 'citizen']
  contact_number text [note: '11 digits starting 09 (API rule)']
  is_active boolean [not null, default: true]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  indexes {
    role [name: 'profiles_role_idx', note: 'Partial: WHERE is_active']
  }

  Note: 'Application fields for each Supabase Auth user.'
}

Table categories {
  id bigint [pk, increment]
  name text [not null, unique]
  description text
  is_active boolean [not null, default: true]
  created_at timestamptz [not null, default: `now()`]
}

Table reports {
  id uuid [pk, default: `gen_random_uuid()`]
  reference_code text [not null, unique, note: 'KMT-<year>-<6-digit sequence>, set by trigger']
  citizen_id uuid [not null]
  category_id bigint [not null]
  assigned_staff_id uuid
  title text [not null, note: '3-150 characters']
  description text [not null, note: 'At least 10 characters']
  latitude "numeric(9,6)" [not null, note: '-90 to 90']
  longitude "numeric(9,6)" [not null, note: '-180 to 180']
  address_text text
  status report_status [not null, default: 'pending']
  is_public boolean [not null, default: false, note: 'Only reviewed reports reach the public board']
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
  }
}

Table report_photos {
  id uuid [pk, default: `gen_random_uuid()`]
  report_id uuid [not null]
  kind photo_kind [not null, default: 'initial']
  storage_path text [not null, note: 'Object key in the report-photos Storage bucket']
  uploaded_by uuid [not null]
  created_at timestamptz [not null, default: `now()`]

  indexes {
    (report_id, kind) [name: 'report_photos_report_idx']
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

  Note: 'System-wide admin log.'
}

// ------------------------------------------------------------- relationships

Ref report_citizen: reports.citizen_id > profiles.id [delete: restrict]
Ref report_category: reports.category_id > categories.id [delete: restrict]
Ref report_assigned_staff: reports.assigned_staff_id > profiles.id [delete: set null]

Ref photo_report: report_photos.report_id > reports.id [delete: cascade]
Ref photo_uploader: report_photos.uploaded_by > profiles.id [delete: restrict]

Ref update_report: report_updates.report_id > reports.id [delete: cascade]
Ref update_author: report_updates.updated_by > profiles.id [delete: restrict]

Ref inspection_report: report_inspections.report_id > reports.id [delete: cascade]
Ref inspection_inspector: report_inspections.inspector_id > profiles.id [delete: restrict]

Ref notification_recipient: notifications.user_id > profiles.id [delete: cascade]
Ref notification_report: notifications.report_id > reports.id [delete: cascade]

Ref log_actor: activity_logs.actor_id > profiles.id [delete: set null]
```

## Notes

- **Supabase Auth:** each `profiles.id` is also a Supabase Auth user id
  (`auth.users.id`, not drawn). Deleting the Auth user deletes the profile.
- **`profiles` plays three roles on `reports`:** the citizen who filed it
  (`citizen_id`), the staff member assigned to it (`assigned_staff_id`, optional),
  and, through photos, updates, and inspections, whoever acted on it.
- **Delete rules:** `restrict` protects history (a profile with reports, photos,
  updates, or inspections cannot be deleted), `cascade` removes a report's child
  rows with it, and `set null` keeps the row but clears the link.
- **Not drawn:** the `public_reports` view (reviewed, non-cancelled reports joined
  to their category name and photos, with no citizen details). DBML has no view
  type. It reads from `reports`, `categories`, and `report_photos`.
