// Readable names for activity_logs.action, for the admin log screen. The API stores
// dotted codes ("report.closure_approved"); screens never print them raw.
//
// Every action the server writes must have a label here. tests/fast/workflow.test.ts
// reads each logActivity / logReportActivity call in src/server and fails when one
// is missing, so a new action cannot reach the log screen as a bare code.
export const ACTIVITY_LABEL: Record<string, string> = {
  "auth.logout": "Signed out",

  "user.created": "Created a user account",
  "user.updated": "Updated a user account",
  "user.phone_verified": "Marked a mobile number as verified",
  "user.phone_unverified": "Marked a mobile number as not verified",
  "residency.uploaded": "Uploaded a proof of residency",
  "residency.proof_viewed": "Opened a proof of residency",
  "residency.reviewed": "Reviewed a proof of residency",

  "category.created": "Created a category",
  "category.updated": "Updated a category",
  "category.deactivated": "Retired a category",

  "report.status_changed": "Changed a report's status",
  "report.assigned": "Assigned a report",
  "report.remark_added": "Added a remark to a report",
  "report.comment_added": "Reporter commented on their report",
  "report.closure_requested": "Requested resolution of a report",
  "report.closure_approved": "Approved a report's resolution",
  "report.closure_returned": "Returned a report for more work",

  "staff.specializations_updated": "Updated staff specializations",

  "feedback.created": "Rated a resolved report",

  "maintenance.photos_purged": "Removed expired photo files",

  "export.reports": "Exported reports",
  "export.logs": "Exported the activity log",

  // Written by scripts/demo/seed.ts, not by the API.
  "demo.report_seeded": "Seeded a demo report",
};

// Falls back to the code with its punctuation turned into spaces, so an action
// added without a label still reads as words rather than nothing.
export function activityLabel(action: string) {
  if (ACTIVITY_LABEL[action]) return ACTIVITY_LABEL[action];
  const words = action.replace(/[._]/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Unknown action";
}
