import { db } from "../config/supabase.js";
import { badRequest, orThrow } from "../lib/errors.js";
import type { AuthUser } from "../types/auth.js";
import { REPORT_FIELDS, recordUpdate, reportLabel, type Report } from "./reports.common.js";

const INVALID_FIELDS = "Some fields are invalid. Fix them and try again.";

type FieldError = { field: string; message: string };

// A report's problem types (RS-4). Both are null on reports filed before problem
// types existed; the API requires a main problem on every new one.
export type ProblemField = "primary_problem_id" | "secondary_problem_id";
export type ProblemIds = { primary_problem_id: number | null; secondary_problem_id: number | null };
export type ProblemRow = { id: number; category_id: number; is_active: boolean };

// The editable columns of a report. The caller passes the current problem ids in
// `before` (problemIdsOf), so the history can name what each one was.
export type ReportChanges = {
  title?: string;
  description?: string;
  category_id?: number;
  latitude?: number;
  longitude?: number;
  address_text?: string | null;
  primary_problem_id?: number | null;
  secondary_problem_id?: number | null;
};

export const SECONDARY_NEEDS_PRIMARY = "Choose the main problem first.";
export const PROBLEMS_DIFFER = "Choose a different problem from the main one.";

// Citizens correct their own report while it is still pending — a wrong pin or a
// vague description is easier to fix than to re-file. The history row says what
// each changed field was and what it became (RS-3), so staff reading it later do
// not have to guess what the citizen corrected.
export async function editReport({
  report,
  user,
  changes,
  before,
}: {
  report: Report;
  user: AuthUser;
  changes: ReportChanges;
  before: ProblemIds;
}) {
  // Names are looked up before writing, so a failed lookup leaves the report as it was
  // rather than changed with no history.
  const details = describeEdit(await editSnapshots(report, changes, before));

  const updated = orThrow(
    await db.from("reports").update(changes).eq("id", report.id).select(REPORT_FIELDS).single(),
    "Your report could not be updated.",
  );

  await recordUpdate({
    report,
    actorId: user.id,
    updateType: "edit",
    details: details ? `Edited by the reporter: ${details}.` : "Edited by the reporter.",
  });

  return updated as unknown as Report;
}

// What an edit looked like on both sides, with ids replaced by the names people read.
export type EditSnapshot = {
  title: string;
  description: string;
  address_text: string | null;
  latitude: number;
  longitude: number;
  category: string | null;
  primary: string | null;
  secondary: string | null;
};

async function editSnapshots(report: Report, changes: ReportChanges, before: ProblemIds) {
  const reportCategory = report.category as { id: number; name: string } | null;

  const after: ProblemIds = {
    primary_problem_id:
      changes.primary_problem_id !== undefined ? changes.primary_problem_id : before.primary_problem_id,
    secondary_problem_id:
      changes.secondary_problem_id !== undefined ? changes.secondary_problem_id : before.secondary_problem_id,
  };

  const problemIds = [
    before.primary_problem_id,
    before.secondary_problem_id,
    after.primary_problem_id,
    after.secondary_problem_id,
  ].filter((id): id is number => id !== null);
  const names = await problemNames(problemIds);
  const nameOf = (id: number | null) => (id === null ? null : names.get(id) ?? `Problem #${id}`);

  let newCategory = reportCategory?.name ?? null;
  if (changes.category_id !== undefined && changes.category_id !== reportCategory?.id) {
    const { data } = await db.from("categories").select("name").eq("id", changes.category_id).single();
    newCategory = (data?.name as string | undefined) ?? `Category #${changes.category_id}`;
  }

  const old: EditSnapshot = {
    title: report.title,
    description: String(report.description ?? ""),
    address_text: (report.address_text as string | null) ?? null,
    latitude: Number(report.latitude),
    longitude: Number(report.longitude),
    category: reportCategory?.name ?? null,
    primary: nameOf(before.primary_problem_id),
    secondary: nameOf(before.secondary_problem_id),
  };

  return {
    before: old,
    after: {
      title: changes.title ?? old.title,
      description: changes.description ?? old.description,
      address_text: changes.address_text !== undefined ? changes.address_text : old.address_text,
      latitude: changes.latitude ?? old.latitude,
      longitude: changes.longitude ?? old.longitude,
      category: newCategory,
      primary: nameOf(after.primary_problem_id),
      secondary: nameOf(after.secondary_problem_id),
    } satisfies EditSnapshot,
  };
}

async function problemNames(ids: number[]) {
  const names = new Map<number, string>();
  if (ids.length === 0) return names;

  const rows = orThrow(
    await db.from("problem_types").select("id, name").in("id", [...new Set(ids)]),
    "Your report could not be updated.",
  ) as { id: number; name: string }[];
  for (const row of rows) names.set(row.id, row.name);
  return names;
}

// Long text is cut so one edit of a 1000-character description does not bury the
// rest of the history. The full current text is always on the report itself.
export const HISTORY_TEXT_LIMIT = 60;

export function truncateForHistory(value: string | null, limit = HISTORY_TEXT_LIMIT) {
  if (value === null || value.trim() === "") return "none";
  const flat = value.replace(/\s+/g, " ").trim();
  const shown = flat.length > limit ? `${flat.slice(0, limit - 1).trimEnd()}…` : flat;
  return `“${shown}”`;
}

const named = (value: string | null) => value ?? "none";
const coordinates = (snapshot: EditSnapshot) =>
  `${snapshot.latitude.toFixed(5)}, ${snapshot.longitude.toFixed(5)}`;

// One "field old → new" phrase per changed field, in the order the form shows them.
// Fields whose value did not actually change are left out.
export function describeEdit({ before, after }: { before: EditSnapshot; after: EditSnapshot }) {
  const parts: string[] = [];
  const add = (label: string, from: string, to: string) => {
    if (from !== to) parts.push(`${label} ${from} → ${to}`);
  };

  add("category", named(before.category), named(after.category));
  add("main problem", named(before.primary), named(after.primary));
  add("other problem", named(before.secondary), named(after.secondary));
  add("title", truncateForHistory(before.title), truncateForHistory(after.title));
  // Compared in full, so an edit past the cut-off still counts; shown truncated.
  if (before.description !== after.description) {
    parts.push(`description ${truncateForHistory(before.description)} → ${truncateForHistory(after.description)}`);
  }
  add("address", truncateForHistory(before.address_text), truncateForHistory(after.address_text));
  add("pin", coordinates(before), coordinates(after));

  return parts.join("; ");
}

// Cancelling keeps the row so the history stays intact; it just leaves the queue.
// The reason is required (SW-2), so staff never find a withdrawn report with no
// explanation.
export async function cancelReport({ report, user, details }: { report: Report; user: AuthUser; details: string }) {
  const updated = orThrow(
    await db
      .from("reports")
      .update({ status: "cancelled", is_public: false, status_changed_at: new Date().toISOString() })
      .eq("id", report.id)
      .select(REPORT_FIELDS)
      .single(),
    "Your report could not be cancelled.",
  );

  await recordUpdate({
    report,
    actorId: user.id,
    updateType: "status_change",
    previousStatus: report.status,
    newStatus: "cancelled",
    details: `Cancelled by the reporter: ${details}`,
    // A report can be assigned while it is still pending, so a withdrawal can land
    // on somebody already treating it as their job.
    notify: [
      {
        userId: report.assigned_staff?.id,
        message: `${reportLabel(report)} was cancelled by the reporter.`,
      },
    ],
  });

  return updated as unknown as Report;
}

// A category id passing the schema only means it is a positive integer. The foreign
// key then guarantees the row exists, but says nothing about whether it is one a
// citizen may still choose: so a retired category was accepted, and a missing one
// surfaced as a constraint violation rather than a field error. Checked here for the
// same reason assignStaff checks `is_active` on a staff member.
export async function assertCategorySelectable(categoryId: number) {
  const { data: category } = await db
    .from("categories")
    .select("id, is_active")
    .eq("id", categoryId)
    .single();

  if (!category) throw badRequest(INVALID_FIELDS, [
    { field: "category_id", message: "Choose a category that exists." },
  ]);

  if (!category.is_active) throw badRequest(INVALID_FIELDS, [
    { field: "category_id", message: "That category has been retired. Choose another." },
  ]);
}

// The same reasoning as assertCategorySelectable, per problem: the schema only knows
// each id is a positive integer. A problem must exist, still be offered, and belong to
// the report's category (RS-2) — otherwise a pothole could be filed as a streetlight
// fault by anyone calling the API directly.
export function problemSelectionErrors(
  rows: ProblemRow[],
  categoryId: number,
  chosen: Partial<Record<ProblemField, number | null>>,
): FieldError[] {
  const errors: FieldError[] = [];

  for (const field of ["primary_problem_id", "secondary_problem_id"] as const) {
    const id = chosen[field];
    if (id === undefined || id === null) continue;

    const row = rows.find((candidate) => candidate.id === id);
    if (!row) errors.push({ field, message: "Choose a problem type that exists." });
    else if (row.category_id !== categoryId) {
      errors.push({ field, message: "Choose a problem from the selected category." });
    } else if (!row.is_active) {
      errors.push({ field, message: "That problem type has been retired. Choose another." });
    }
  }

  return errors;
}

export async function assertProblemsSelectable(
  categoryId: number,
  chosen: Partial<Record<ProblemField, number | null>>,
) {
  const ids = Object.values(chosen).filter((id): id is number => typeof id === "number");
  if (ids.length === 0) return;

  const rows = orThrow(
    await db.from("problem_types").select("id, category_id, is_active").in("id", ids),
    "The problem types could not be checked.",
  ) as ProblemRow[];

  const errors = problemSelectionErrors(rows, categoryId, chosen);
  if (errors.length > 0) throw badRequest(INVALID_FIELDS, errors);
}

// Works out which problem columns an edit writes. Moving the report to another
// category already requires a new main problem (editSchema); the other problem of
// the old category cannot follow it, so it is cleared unless a new one is sent.
// The result must still leave a valid pair: no other problem without a main one,
// and never the same problem twice.
export function resolveProblemEdit(
  current: ProblemIds,
  changes: Pick<ReportChanges, "primary_problem_id" | "secondary_problem_id">,
  categoryChanged: boolean,
): { write: Partial<ProblemIds>; errors: FieldError[] } {
  const write: Partial<ProblemIds> = {};
  if (changes.primary_problem_id !== undefined) write.primary_problem_id = changes.primary_problem_id;
  if (changes.secondary_problem_id !== undefined) write.secondary_problem_id = changes.secondary_problem_id;
  else if (categoryChanged && current.secondary_problem_id !== null) write.secondary_problem_id = null;

  const primary = write.primary_problem_id !== undefined ? write.primary_problem_id : current.primary_problem_id;
  const secondary =
    write.secondary_problem_id !== undefined ? write.secondary_problem_id : current.secondary_problem_id;

  const errors: FieldError[] = [];
  if (secondary !== null && primary === null) {
    errors.push({ field: "secondary_problem_id", message: SECONDARY_NEEDS_PRIMARY });
  } else if (secondary !== null && secondary === primary) {
    errors.push({ field: "secondary_problem_id", message: PROBLEMS_DIFFER });
  }

  return { write, errors };
}

export function assertProblemEditValid(errors: FieldError[]) {
  if (errors.length > 0) throw badRequest(INVALID_FIELDS, errors);
}

// Every problem type a citizen may choose, grouped under its category so the form
// can show only the selected category's list (RS-2). Ordered by id, which is the
// seed order: the most common problem first and the catch-all last.
export async function listProblemTypes() {
  const rows = orThrow(
    await db
      .from("problem_types")
      .select("id, name, category_id")
      .eq("is_active", true)
      .order("id", { ascending: true }),
    "The problem types could not be loaded.",
  ) as { id: number; name: string; category_id: number }[];

  return groupProblemTypes(rows);
}

export function groupProblemTypes(rows: { id: number; name: string; category_id: number }[]) {
  const groups = new Map<number, { id: number; name: string }[]>();
  for (const { id, name, category_id } of rows) {
    const group = groups.get(category_id) ?? [];
    group.push({ id, name });
    groups.set(category_id, group);
  }
  return [...groups].map(([category_id, problem_types]) => ({ category_id, problem_types }));
}

// A new report has nobody assigned to it, so the only people who can act on it are
// the administrators who do the assigning. Without this nothing announces that work
// has arrived, and a report sits in `pending` until someone thinks to look.
//
// Failure is logged and swallowed rather than thrown: the citizen's report is
// already saved, and a notification that did not send is no reason to tell them
// their submission failed.
export async function notifyNewReport(report: Report) {
  const { data: admins, error: lookupFailed } = await db
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .eq("is_active", true);

  if (lookupFailed) {
    console.error("Could not look up admins to notify:", lookupFailed.message);
    return;
  }
  if (!admins?.length) return;

  const { error } = await db.from("notifications").insert(
    admins.map((admin) => ({
      user_id: admin.id,
      report_id: report.id,
      message: `${reportLabel(report)} was filed and is waiting to be assigned.`,
    })),
  );

  if (error) console.error("Could not notify admins of a new report:", error.message);
}
