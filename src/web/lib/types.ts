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

// Mirrors NEXT_STATUS in src/server/services/reports.service.ts: one step at a time,
// no skipping and no going back. The server enforces this in changeStatus(); the UI
// reads it only so it can offer the single legal step rather than a list to choose
// from. A status with no next step is a dead end.
export const NEXT_STATUS: Record<ReportStatus, ReportStatus | null> = {
  pending: "under_review",
  under_review: "in_progress",
  in_progress: "resolved",
  resolved: null,
  cancelled: null,
};

// The verb for taking that step, used on the button that takes it.
export const NEXT_STATUS_LABEL: Record<ReportStatus, string | null> = {
  pending: "Start review",
  under_review: "Begin work",
  in_progress: "Mark resolved",
  resolved: null,
  cancelled: null,
};

export type Profile = {
  id: string;
  name: string;
  email: string;
  role: Role;
  contact_number?: string | null;
  is_active?: boolean;
  created_at?: string;
};

export type Photo = {
  id: number;
  kind: "initial" | "resolution";
  storage_path: string;
  created_at: string;
  url: string;
};

// The public board's view exposes only these two photo columns, plus the built URL.
export type PublicPhoto = Pick<Photo, "kind" | "storage_path" | "url">;

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
  category: Pick<Category, "id" | "name"> | null;
  // Staff need a way to reach the reporter, so contact columns are joined in here.
  // The public board reads a different view that has none of them.
  citizen: Pick<Profile, "id" | "name" | "email" | "contact_number"> | null;
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
