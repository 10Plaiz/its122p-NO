// Deletes what the browser tests wrote to the database. Playwright runs it once after
// every `bun run test:browser` (globalTeardown), pass or fail; `bun run test:cleanup`
// runs it on its own.
//
// Safety contract:
// - Requires an explicit cleanup hostname for an approved disposable target.
//   A working key and fixture accounts alone do not authorize deletion.
//   Otherwise it prints why and deletes nothing. It never fails the test run.
// - Deletes only rows that are both fixture-owned and carry a test marker from
//   helpers.ts. [FIXTURE] reports, real reports, and demo-seed data never match.

import "dotenv/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { TEST_REMARK, TEST_TITLE_PREFIX, USERS } from "./helpers.js";

const BUCKET = "report-photos";

export default async function cleanupTestData(): Promise<void> {
  try {
    const removed = await cleanup();
    if (removed) {
      console.log(`Test-data cleanup: ${removed.reports} report(s), ${removed.remarks} remark(s) removed.`);
      if (removed.rated > 0) {
        console.log(`Kept ${removed.rated} rated test report(s): ratings can never be deleted (20261003000500_feedback.sql).`);
      }
    }
  } catch (error) {
    console.warn(`Test-data cleanup failed: ${(error as Error).message}`);
  }
}

async function cleanup(): Promise<{ reports: number; remarks: number; rated: number } | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return skip("SUPABASE_URL and SUPABASE_SECRET_KEY are not set in .env.");
  if (process.env.KAMOTI_TEST_CLEANUP_TARGET !== new URL(url).hostname) {
    return skip("records are retained; no matching disposable cleanup target was authorized.");
  }

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Verification: the key works and this is the project the fixture accounts live in.
  const emails = Object.values(USERS);
  const profiles = await db.from("profiles").select("id, email").in("email", emails);
  if (profiles.error) return skip(`the Supabase key was refused (${profiles.error.message}).`);
  if (profiles.data.length !== emails.length) return skip("this project does not have every fixture account.");
  const fixtureIds = profiles.data.map((profile) => profile.id as string);

  const reports = await db
    .from("reports")
    .select("id, report_photos(storage_path), report_feedback(id)")
    .in("citizen_id", fixtureIds)
    .like("title", `${TEST_TITLE_PREFIX}%`);
  if (reports.error) throw new Error(reports.error.message);

  // A rating is immutable: service_role may insert and read report_feedback but not
  // delete from it, so a rated report (and its photos and history) stays. Granting
  // delete just for tests would undo FB-1's guarantee.
  const removable = reports.data.filter((report) => (report.report_feedback ?? []).length === 0);
  const rated = reports.data.length - removable.length;

  if (removable.length > 0) {
    // Storage is not covered by the foreign keys, so the files go first.
    const paths = removable.flatMap((report) =>
      (report.report_photos ?? [])
        .map((photo: { storage_path?: string | null }) => photo.storage_path)
        .filter(Boolean) as string[],
    );
    if (paths.length > 0) {
      const storage = await db.storage.from(BUCKET).remove(paths);
      if (storage.error) throw new Error(storage.error.message);
    }

    // The app never deletes rows (DM-1), and since 20261003000100_no_delete.sql every
    // key into reports is ON DELETE RESTRICT, so nothing cascades any more. This
    // teardown is the documented exception: it only ever runs against the disposable
    // fixture project, so it removes the children first and the reports last.
    // A table added later that points at reports must be added to this list.
    const reportIds = removable.map((report) => report.id as string);
    for (const table of ["notifications", "report_inspections", "report_updates", "report_photos"]) {
      const children = await db.from(table).delete().in("report_id", reportIds);
      if (children.error) throw new Error(`${table}: ${children.error.message}`);
    }

    const deleted = await db.from("reports").delete().in("id", reportIds);
    if (deleted.error) throw new Error(deleted.error.message);
  }

  const remarks = await db
    .from("report_updates")
    .delete()
    .eq("update_type", "remark")
    .eq("details", TEST_REMARK)
    .in("updated_by", fixtureIds)
    .select("id");
  if (remarks.error) throw new Error(remarks.error.message);

  return { reports: removable.length, remarks: remarks.data?.length ?? 0, rated };
}

function skip(reason: string): null {
  console.log(`Skipped test-data cleanup: ${reason}`);
  return null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await cleanupTestData();
}
