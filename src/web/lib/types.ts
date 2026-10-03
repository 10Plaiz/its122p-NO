// Response shapes mirrored from the API. Kept by hand rather than generated so the
// frontend has one place to look; when a route's response changes, change it here.
// Sources are named per block so a mismatch is traceable.

export const STATUSES = ["pending", "under_review", "in_progress", "resolved", "cancelled"] as const;
export type ReportStatus = (typeof STATUSES)[number];

// The only statuses the public board can show — see PUBLIC_STATUSES in
// src/server/services/reports.service.ts.
export const PUBLIC_STATUSES = ["under_review", "in_progress", "resolved"] as const;

export const ROLES = ["citizen", "staff", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const SORTS = ["newest", "oldest", "status"] as const;
export type Sort = (typeof SORTS)[number];

// Human labels. The API speaks snake_case; screens never print it raw.
export const STATUS_LABEL: Record<ReportStatus, string> = {
  pending: "Pending",
  under_review: "Under review",
  in_progress: "In progress",
  resolved: "Resolved",
  cancelled: "Cancelled",
};

// Roles follow the same rule as statuses above. `admin` reads as "Administrator"
// rather than "Admin" because that is the word the proposal and every screen title
// use for the role.
export const ROLE_LABEL: Record<Role, string> = {
  citizen: "Citizen",
  staff: "Staff",
  admin: "Administrator",
};

// Mirrors NEXT_STATUS in src/server/services/reports.workflow.ts: one step at a time,
// no skipping and no going back. The server enforces this in changeStatus(); the UI
// reads it only so it can offer the single legal step rather than a list to choose
// from. "in_progress" has no manual step: staff request resolution and an
// administrator closes the report by verifying it. Otherwise null is a dead end.
export const NEXT_STATUS: Record<ReportStatus, ReportStatus | null> = {
  pending: "under_review",
  under_review: "in_progress",
  in_progress: null,
  resolved: null,
  cancelled: null,
};

// The verb for taking that step, used on the button that takes it.
export const NEXT_STATUS_LABEL: Record<ReportStatus, string | null> = {
  pending: "Start review",
  under_review: "Begin work",
  in_progress: null,
  resolved: null,
  cancelled: null,
};

// Mirrors STAFF_STATUSES in src/server/services/reports.workflow.ts: what staff and
// admins can set by hand through PATCH /status.
export const STAFF_STATUSES = ["under_review", "in_progress"] as const;

// Mirrors CLOSURE_OUTCOMES: what a resolution request can ask for today.
export const CLOSURE_OUTCOMES = ["resolved"] as const;
export type ClosureOutcome = "resolved" | "rejected";

// Mirrors DELAY_THRESHOLD_DAYS and VERIFICATION_DELAY_DAYS: days a report may sit
// at a stage before it shows as delayed. The server computes the flag; these are
// for screens that explain it.
export const DELAY_THRESHOLD_DAYS: Partial<Record<ReportStatus, number>> = {
  pending: 3,
  under_review: 5,
  in_progress: 14,
};
export const VERIFICATION_DELAY_DAYS = 3;

// History entry kinds from report_updates.update_type, as a reader would say them.
export const UPDATE_TYPE_LABEL: Record<string, string> = {
  status_change: "Status changed",
  assignment: "Assigned",
  remark: "Remark",
  photo: "Photo added",
  edit: "Report edited",
  closure_request: "Resolution requested",
  verification: "Verification decision",
};

export function updateTypeLabel(type: string) {
  return UPDATE_TYPE_LABEL[type] ?? type.replace(/[._]/g, " ");
}

export type Profile = {
  id: string;
  name: string;
  email: string;
  role: Role;
  contact_number?: string | null;
  is_active?: boolean;
  created_at?: string;
  // UA-6, UA-8 (src/server/lib/accounts-profile.ts, ACCOUNT_FIELDS).
  phone_verified_at?: string | null;
  barangay?: string | null;
  address_line?: string | null;
  residency_status?: "pending" | "verified" | "rejected" | null;
  residency_note?: string | null;
  has_residency_proof?: boolean;
  // Admin users list only (ADMIN_USER_FIELDS).
  residency_reviewed_at?: string | null;
  reviewer?: { id: string; name: string } | null;
};

export type Photo = {
  id: number;
  kind: "initial" | "resolution";
  storage_path: string;
  created_at: string;
  // Set when the file was removed after the 90-day retention period (DM-2); the
  // URL is then null and the page says so instead of showing a broken image.
  purged_at: string | null;
  url: string | null;
};

// The public board's view exposes only these two photo columns, plus the built URL.
// Only cancelled reports lose their files, and the board never shows those.
export type PublicPhoto = Pick<Photo, "kind" | "storage_path"> & { url: string };

export type Category = {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
};

// src/server/services/reports.service.ts — REPORT_FIELDS
export type Report = {
  id: string;
  reference_code: string;
  title: string;
  description: string;
  status: ReportStatus;
  latitude: number;
  longitude: number;
  address_text: string | null;
  is_public: boolean;
  submitted_at: string;
  updated_at: string;
  resolved_at: string | null;
  // Workflow dates (SW-6) and closure state (SW-4). See ReportWorkflow for the
  // requester and verifier names and the computed delay.
  assigned_at: string | null;
  status_changed_at: string;
  closure_requested_at: string | null;
  closure_outcome: ClosureOutcome | null;
  closure_reason: string | null;
  verified_at: string | null;
  category: Pick<Category, "id" | "name"> | null;
  // RS-4. Both null on reports filed before problem types existed.
  primary_problem: { id: number; name: string } | null;
  secondary_problem: { id: number; name: string } | null;
  // Staff need a way to reach the reporter, so contact columns are joined in here.
  // The public board reads a different view that has none of them.
  citizen: Pick<Profile, "id" | "name" | "email" | "contact_number" | "phone_verified_at" | "residency_status"> | null;
  assigned_staff: Pick<Profile, "id" | "name" | "email"> | null;
  photos: Photo[];
};

// The public_reports view drops every citizen column and flattens the category name.
export type PublicReport = {
  id: string;
  reference_code: string;
  title: string;
  description: string;
  category: string;
  category_id: number;
  latitude: number;
  longitude: number;
  address_text: string | null;
  status: ReportStatus;
  submitted_at: string;
  resolved_at: string | null;
  photos: PublicPhoto[];
};

// src/server/routes/reports.routes.ts — GET /:id/updates
export type ReportUpdate = {
  id: number;
  update_type: string;
  previous_status: ReportStatus | null;
  new_status: ReportStatus | null;
  details: string | null;
  created_at: string;
  author: Pick<Profile, "id" | "name" | "role"> | null;
};

// src/server/services/reports.workflow.ts — presentWorkflow(), from
// GET /api/reports/:id/workflow. Adds to Report's workflow columns the names of who
// requested and verified a closure, and the computed delay.
export type DelayStage = ReportStatus | "awaiting_verification";

export type ReportWorkflow = {
  submitted_at: string;
  assigned_at: string | null;
  status_since: string;
  completed_at: string | null;
  delay: {
    stage: DelayStage;
    since: string;
    days: number;
    threshold_days: number | null;
    delayed: boolean;
    days_over: number;
  };
  closure: {
    pending: boolean;
    requested_at: string;
    requested_by: Pick<Profile, "id" | "name"> | null;
    outcome: ClosureOutcome | null;
    reason: string | null;
  } | null;
  verified_at: string | null;
  verified_by: Pick<Profile, "id" | "name"> | null;
};

// src/server/routes/staff.routes.ts — GET /api/staff
export type StaffOption = Pick<Profile, "id" | "name" | "email"> & {
  specializations: Pick<Category, "id" | "name">[];
  open_load: number;
  is_specialist: boolean;
};

export type Notification = {
  id: number;
  message: string;
  is_read: boolean;
  created_at: string;
  report_id: string | null;
};

export type ActivityLog = {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor: Pick<Profile, "id" | "name" | "role"> | null;
};

export type Analytics = {
  total_reports: number;
  by_status: Record<ReportStatus, number>;
  by_category: Record<string, number>;
  resolved_count: number;
  average_resolution_days: number | null;
};

export type PublicStats = {
  total: number;
  by_status: Record<(typeof PUBLIC_STATUSES)[number], number>;
};

// Every list route returns this envelope.
export type Paged<K extends string, T> = { [P in K]: T[] } & {
  page: number;
  per_page: number;
  total: number;
};

export type Session = {
  user: Profile;
  access_token: string;
  refresh_token: string;
  expires_at: number;
};
