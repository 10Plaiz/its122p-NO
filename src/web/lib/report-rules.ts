import { MAKATI_ERROR, isInsideMakati } from "../../server/lib/makati-boundary.js";
import type { ProblemType, ProblemTypeGroup } from "./submission-types.js";
import type { Report } from "./types.js";

// The report form's rules, shared by the new-report wizard and the edit form.
// Mirrors createSchema, editSchema and cancelSchema in
// src/server/routes/reports.submission.routes.ts, message for message. The server
// checks everything again; these only spare the citizen a round trip.

export const TITLE_MIN_ERROR = "Give the report a title of at least 3 characters.";
export const TITLE_MAX_ERROR = "Keep the title under 150 characters.";
export const DESCRIPTION_MIN_ERROR = "Describe the problem in at least 10 characters.";
export const DESCRIPTION_MAX_ERROR = "Keep the description under 1000 characters.";
export const CATEGORY_ERROR = "Choose the category that fits best.";
export const ADDRESS_MAX_ERROR = "Keep the address under 255 characters.";
export const PRIMARY_PROBLEM_ERROR = "Choose the main problem.";
export const PRIMARY_PROBLEM_AGAIN_ERROR = "Choose the main problem again for the new category.";
export const PROBLEMS_DIFFER = "Choose a different problem from the main one.";
export const CANCEL_REASON_ERROR = "Give a reason for withdrawing this report.";
export const CANCEL_REASON_MAX_ERROR = "Keep the reason under 500 characters.";
export const PIN_OUTSIDE_ERROR = `The pin is outside Makati. ${MAKATI_ERROR}`;

export const TITLE_MAX = 150;
export const DESCRIPTION_MAX = 1000;
export const ADDRESS_MAX = 255;
export const CANCEL_REASON_MAX = 500;

export type ReportFieldValues = {
  title: string;
  description: string;
  categoryId: string;
  address: string;
  primaryId: string;
  secondaryId: string;
};

// Keys are the API's field names, so a server field error lands on the same control.
// Their order is the order the form shows them in, which is the order focus moves.
// `primaryMessage` is null when the main problem may stay empty: an edit of a report
// filed before problem types existed, where the category is not changing.
export function validateReportFields(
  values: ReportFieldValues,
  primaryMessage: string | null = PRIMARY_PROBLEM_ERROR,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!values.categoryId) errors.category_id = CATEGORY_ERROR;
  if (!values.primaryId && primaryMessage) errors.primary_problem_id = primaryMessage;
  if (values.secondaryId && values.secondaryId === values.primaryId) {
    errors.secondary_problem_id = PROBLEMS_DIFFER;
  }

  const title = values.title.trim();
  if (title.length < 3) errors.title = TITLE_MIN_ERROR;
  if (title.length > TITLE_MAX) errors.title = TITLE_MAX_ERROR;

  const description = values.description.trim();
  if (description.length < 10) errors.description = DESCRIPTION_MIN_ERROR;
  if (description.length > DESCRIPTION_MAX) errors.description = DESCRIPTION_MAX_ERROR;

  if (values.address.length > ADDRESS_MAX) errors.address_text = ADDRESS_MAX_ERROR;

  return errors;
}

// MP-2, mirrors refineInsideMakati. The map refuses a tap outside Makati, but a
// device location or a restored draft can still hand the form such a pin.
export function pinError(point: { lat: number; lng: number } | null): string | undefined {
  if (point && !isInsideMakati(point.lat, point.lng)) return PIN_OUTSIDE_ERROR;
  return undefined;
}

export function validateCancelReason(details: string): string | undefined {
  const reason = details.trim();
  if (!reason) return CANCEL_REASON_ERROR;
  if (reason.length > CANCEL_REASON_MAX) return CANCEL_REASON_MAX_ERROR;
  return undefined;
}

// RS-2: only the selected category's problem types are offered. `exclude` drops the
// main problem from the second list, so the same problem can never be chosen twice.
// `keep` adds a problem the report already has but the list no longer offers (it was
// retired), so the edit form can still show what is saved.
export function problemOptions(
  groups: ProblemTypeGroup[] | undefined,
  categoryId: string,
  { exclude, keep }: { exclude?: string; keep?: ProblemType | null } = {},
): ProblemType[] {
  if (!categoryId) return [];
  const listed = groups?.find((group) => String(group.category_id) === categoryId)?.problem_types ?? [];
  const withKept = keep && !listed.some((problem) => problem.id === keep.id) ? [...listed, keep] : listed;
  return exclude ? withKept.filter((problem) => String(problem.id) !== exclude) : withKept;
}

// RS-5: what the new-report wizard keeps in its draft. Everything typed or chosen
// except the photo, which cannot be stored and would be large if it could.
export type NewReportDraft = {
  version: 1;
  step: number;
  point: { lat: number; lng: number } | null;
  address: string;
  title: string;
  description: string;
  categoryId: string;
  primaryId: string;
  secondaryId: string;
};

export const NEW_REPORT_DRAFT_KEY = "kamoti.draft.new-report";

export function isNewReportDraftEmpty(draft: NewReportDraft) {
  return (
    draft.point === null &&
    [draft.address, draft.title, draft.description, draft.categoryId].every((text) => text.trim() === "")
  );
}

// A stored draft may come from an older build or have been edited by hand, so each
// field is checked and anything unexpected falls back to empty rather than breaking
// the form.
function storedText(stored: Record<string, unknown>, key: string, max: number) {
  const value = stored[key];
  return typeof value === "string" ? value.slice(0, max) : "";
}

function storedId(stored: Record<string, unknown>, key: string) {
  const value = stored[key];
  return typeof value === "string" && /^\d+$/.test(value) ? value : "";
}

function storedPoint(stored: Record<string, unknown>) {
  const point = stored.point as { lat?: unknown; lng?: unknown } | null | undefined;
  return point &&
    typeof point.lat === "number" &&
    typeof point.lng === "number" &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180
    ? { lat: point.lat, lng: point.lng }
    : null;
}

export function parseNewReportDraft(raw: unknown): NewReportDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const stored = raw as Record<string, unknown>;
  if (stored.version !== 1) return null;

  const step =
    typeof stored.step === "number" && Number.isInteger(stored.step) ? Math.min(Math.max(stored.step, 0), 2) : 0;

  return {
    version: 1,
    step,
    point: storedPoint(stored),
    address: storedText(stored, "address", ADDRESS_MAX),
    title: storedText(stored, "title", TITLE_MAX),
    description: storedText(stored, "description", DESCRIPTION_MAX),
    categoryId: storedId(stored, "categoryId"),
    primaryId: storedId(stored, "primaryId"),
    secondaryId: storedId(stored, "secondaryId"),
  };
}

// RS-5 (#69): what the edit form on /reports/:id keeps in its draft. The key
// carries the account and the report, so neither another account nor another
// report is ever offered it. `point` is set only once the citizen moves the pin.
export type EditReportDraft = {
  version: 1;
  // The report's updated_at when editing began. A report changed since then drops
  // the draft rather than restore it over newer saved values.
  basedOn: string;
  title: string;
  description: string;
  categoryId: string;
  primaryId: string;
  secondaryId: string;
  address: string;
  point: { lat: number; lng: number } | null;
};

export const EDIT_REPORT_DRAFT_KEY = "kamoti.draft.edit-report";

export function editReportDraftKey(userId: string, reportId: string) {
  return `${EDIT_REPORT_DRAFT_KEY}.${userId}.${reportId}`;
}

export function parseEditReportDraft(raw: unknown): EditReportDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const stored = raw as Record<string, unknown>;
  if (stored.version !== 1 || typeof stored.basedOn !== "string" || !stored.basedOn) return null;

  return {
    version: 1,
    basedOn: stored.basedOn,
    title: storedText(stored, "title", TITLE_MAX),
    description: storedText(stored, "description", DESCRIPTION_MAX),
    categoryId: storedId(stored, "categoryId"),
    primaryId: storedId(stored, "primaryId"),
    secondaryId: storedId(stored, "secondaryId"),
    address: storedText(stored, "address", ADDRESS_MAX),
    point: storedPoint(stored),
  };
}

// The PATCH body for an edit: only what differs from the saved report. An empty
// object means nothing changed, so Save stays disabled and no draft is kept.
export function editReportChanges(draft: EditReportDraft, report: Report) {
  const savedPrimary = report.primary_problem ? String(report.primary_problem.id) : "";
  const savedSecondary = report.secondary_problem ? String(report.secondary_problem.id) : "";
  const categoryChanged = Number(draft.categoryId) !== report.category?.id;
  const changes: Record<string, unknown> = {};
  if (draft.title.trim() !== report.title) changes.title = draft.title.trim();
  if (draft.description.trim() !== report.description) changes.description = draft.description.trim();
  if (categoryChanged) changes.category_id = Number(draft.categoryId);
  if (draft.point && (draft.point.lat !== report.latitude || draft.point.lng !== report.longitude)) {
    changes.latitude = draft.point.lat;
    changes.longitude = draft.point.lng;
  }
  const cleanAddress = draft.address.trim();
  if (cleanAddress !== (report.address_text ?? "")) changes.address_text = cleanAddress || null;
  if (draft.primaryId !== savedPrimary || categoryChanged) changes.primary_problem_id = Number(draft.primaryId);
  if (draft.secondaryId !== savedSecondary) changes.secondary_problem_id = draft.secondaryId ? Number(draft.secondaryId) : null;
  return changes;
}

export const EDIT_DRAFT_NOT_PENDING = "Your unsaved edits were discarded because this report is no longer pending.";
export const EDIT_DRAFT_CHANGED = "Your unsaved edits were discarded because this report changed since they were made.";

// What the report page does with a stored edit draft: offer it back, or drop it.
// A notice says why when the report can no longer take it; a draft that changes
// nothing, or cannot be read, is dropped quietly.
export function checkEditDraft(stored: unknown, report: Report): { offer: EditReportDraft | null; notice: string | null } {
  const draft = parseEditReportDraft(stored);
  if (!draft) return { offer: null, notice: null };
  if (report.status !== "pending") return { offer: null, notice: EDIT_DRAFT_NOT_PENDING };
  if (draft.basedOn !== report.updated_at) return { offer: null, notice: EDIT_DRAFT_CHANGED };
  if (Object.keys(editReportChanges(draft, report)).length === 0) return { offer: null, notice: null };
  return { offer: draft, notice: null };
}

// Google may round its camera center by a fraction of a millimetre.
export function sameReportPoint(a: { lat: number; lng: number }, b: { lat: number; lng: number }): boolean {
  return Math.abs(a.lat - b.lat) < 1e-8 && Math.abs(a.lng - b.lng) < 1e-8;
}
