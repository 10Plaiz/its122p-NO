// Deletes what the browser tests wrote to the database. Playwright runs it once after
// every `bun run test:browser` (globalTeardown), pass or fail; `bun run test:cleanup`
// runs it on its own.
//
// Safety contract:
// - Runs only when verified: the .env secret key works, and every fixture account
//   exists in that project, which marks it as the fixture-seeded test project.
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
    }
  } catch (error) {
    console.warn(`Test-data cleanup failed: ${(error as Error).message}`);
  }
}

async function cleanup(): Promise<{ reports: number; remarks: number } | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return skip("SUPABASE_URL and SUPABASE_SECRET_KEY are not set in .env.");

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Verification: the key works and this is the project the fixture accounts live in.
  const emails = Object.values(USERS);
  const profiles = await db.from("profiles").select("id, email").in("email", emails);
  if (profiles.error) return skip(`the Supabase key was refused (${profiles.error.message}).`);
  if (profiles.data.length !== emails.length) return skip("this project does not have every fixture account.");
  const fixtureIds = profiles.data.map((profile) => profile.id as string);

  const reports = await db
    .from("reports")
    .select("id, report_photos(storage_path)")
    .in("citizen_id", fixtureIds)
    .like("title", `${TEST_TITLE_PREFIX}%`);
  if (reports.error) throw new Error(reports.error.message);

  if (reports.data.length > 0) {
    // Storage is not covered by the foreign keys, so the files go first.
    const paths = reports.data.flatMap((report) => report.report_photos.map((photo) => photo.storage_path as string));
    if (paths.length > 0) {
      const storage = await db.storage.from(BUCKET).remove(paths);
      if (storage.error) throw new Error(storage.error.message);
    }

    // Photos, updates, notifications, and inspections cascade with the report.
    const deleted = await db.from("reports").delete().in("id", reports.data.map((report) => report.id as string));
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

  return { reports: reports.data.length, remarks: remarks.data.length };
}

function skip(reason: string): null {
  console.log(`Skipped test-data cleanup: ${reason}`);
  return null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await cleanupTestData();
}
