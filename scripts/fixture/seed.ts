// KAMOTI synthetic development fixture (issue #5).
//
// Creates or reuses a small, clearly marked set of accounts and reports for
// local development and verification work. The fixture contract (aliases,
// roles, ownership, assignment, and report states) is documented in
// docs/LOCAL_DEV.md under "Synthetic development data".
//
// Safety contract:
// - Refuses to run unless --target names the configured Supabase project.
// - Requires a confirmation phrase that only this fixture uses.
// - Takes the fixture password at runtime only. It is never stored in the
//   repository, printed, or logged.
// - Creates missing fixture-owned records, reuses existing matching records,
//   and corrects fixture-owned records only to restore the fixture contract.
// - Never deletes, resets, rewrites, deactivates, or reassigns an ordinary
//   account or report.

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";
import { writeSync } from "node:fs";
import { exit, stdin } from "node:process";
import { REPORTS } from "./reports.js";

const CONFIRM_PHRASE = "KAMOTI-APPLY-FIXTURE";

type Role = "admin" | "staff" | "citizen";

// UA-8: fixture citizens are confirmed residents, so tests and demos sign in to a
// working account instead of the proof-upload step. Staff and admins have none.
function residencyFor(role: Role) {
  return role === "citizen" ? "verified" : null;
}

type AccountSpec = {
  key: string;
  email: string;
  name: string;
  role: Role;
};

const ACCOUNTS: AccountSpec[] = [
  { key: "admin", email: "fixture-admin@kamoti.invalid", name: "Fixture Administrator", role: "admin" },
  { key: "citizen-1", email: "fixture-citizen-1@kamoti.invalid", name: "Fixture Citizen One", role: "citizen" },
  { key: "citizen-2", email: "fixture-citizen-2@kamoti.invalid", name: "Fixture Citizen Two", role: "citizen" },
  { key: "staff-1", email: "fixture-staff-1@kamoti.invalid", name: "Fixture Staff One", role: "staff" },
  { key: "staff-2", email: "fixture-staff-2@kamoti.invalid", name: "Fixture Staff Two", role: "staff" },
];


// ------------------------------------------------------------------- prompts

// Synchronous writes so a scripted run piped to a file never loses output.
function out(text: string): void {
  writeSync(1, text);
}

// Reads every line of piped stdin up front. Used when stdin is not a terminal
// so readline never consumes lines that a later prompt still needs.
async function readPipedLines(): Promise<string[] | null> {
  if (stdin.isTTY) return null;
  const chunks: Uint8Array[] = [];
  for await (const chunk of stdin) chunks.push(chunk as Uint8Array);
  return Buffer.concat(chunks).toString("utf8").split(/\r?\n/).map((line) => line.trim());
}

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, terminal: true });
  return new Promise((resolve) => {
    // Without this, Ctrl+C at the prompt leaves the promise unresolved and
    // the script hanging. Exit the same way the hidden prompt does.
    rl.on("SIGINT", () => {
      rl.close();
      out("\n");
      exit(130);
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Reads one line without echoing it. Piped stdin also works, so scripted runs
// behave the same way as interactive ones.
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    out(question);
    let value = "";
    const onData = (chunk: Buffer) => {
      for (const ch of chunk.toString("utf8")) {
        if (ch === "\r" || ch === "\n") {
          stdin.off("data", onData);
          stdin.pause();
          out("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          // Ctrl+C: stop without printing anything.
          out("\n");
          exit(130);
        }
        if (ch === "\u007f" || ch === "\b") {
          value = value.slice(0, -1);
          if (stdin.isTTY) out("\b \b");
          continue;
        }
        value += ch;
      }
    };
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

// -------------------------------------------------------------------- guards

function refuse(message: string): never {
  writeSync(2, `Fixture refused: ${message}\n`);
  exit(1);
}

function projectRef(url: string): string | null {
  try {
    return new URL(url).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}

function parseTarget(argv: string[]): string | null {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--target") return argv[i + 1] ?? null;
    if (argv[i]?.startsWith("--target=")) return argv[i]!.slice("--target=".length);
  }
  return null;
}

// ---------------------------------------------------------------------- main

async function main(): Promise<void> {
  const target = parseTarget(process.argv.slice(2));
  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) {
    refuse("SUPABASE_URL and SUPABASE_SECRET_KEY must be set. Copy .env.example to .env and fill it in.");
  }

  const configured = projectRef(supabaseUrl!);
  if (!configured) refuse("SUPABASE_URL is not a usable URL.");

  out(`KAMOTI synthetic development fixture\nConfigured target: ${configured}\n`);
  if (!target) {
    refuse(
      `This command changes the Supabase project named above. Pass --target ${configured} ` +
        "to confirm this run is aimed at an approved local development project.",
    );
  }
  if (target !== configured) {
    refuse(`--target ${target} does not match the configured project ${configured}. No changes were made.`);
  }

  const db = createClient(supabaseUrl!, secretKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Fail fast when the target has no schema, before asking for any input and
  // before any write happens.
  const probe = await db.from("profiles").select("id").limit(1);
  if (probe.error) {
    refuse(
      `Cannot read the profiles table on ${configured}: ${probe.error.message}. ` +
        "Apply the migrations first (see docs/API.md).",
    );
  }

  // Piped stdin carries both answers up front; a terminal gets prompted live.
  const piped = await readPipedLines();
  let confirmation: string;
  let password: string;
  if (piped) {
    if (piped.length < 2 || !piped[0] || !piped[1]) {
      refuse("Piped input must carry the confirmation phrase and the password, one per line. No changes were made.");
    }
    confirmation = piped[0]!;
    password = piped[1]!;
  } else {
    confirmation = await ask(`Type ${CONFIRM_PHRASE} to apply the fixture to ${configured}: `);
    password = await askHidden("Fixture password (hidden, 8-72 characters): ");
  }
  if (confirmation !== CONFIRM_PHRASE) {
    refuse(`The confirmation phrase did not match ${CONFIRM_PHRASE}. No changes were made.`);
  }
  if (password.length < 8 || password.length > 72) {
    refuse("The password must be 8 to 72 characters. No changes were made.");
  }

  // ---------------------------------------------------------------- accounts

  const accountId = new Map<string, string>();
  const accountLines: string[] = [];

  for (const spec of ACCOUNTS) {
    const existing = await db
      .from("profiles")
      .select("id, name, role, is_active, residency_status")
      .eq("email", spec.email)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);

    if (existing.data) {
      const row = existing.data as { id: string; name: string; role: string; is_active: boolean; residency_status: string | null };
      const fixes: { name?: string; role?: Role; is_active?: boolean; residency_status?: string | null } = {};
      if (row.name !== spec.name) fixes.name = spec.name;
      if (row.role !== spec.role) fixes.role = spec.role;
      if (!row.is_active) fixes.is_active = true;
      if (row.residency_status !== residencyFor(spec.role)) fixes.residency_status = residencyFor(spec.role);
      if (Object.keys(fixes).length > 0) {
        const updated = await db.from("profiles").update(fixes).eq("id", row.id);
        if (updated.error) throw new Error(updated.error.message);
      }
      // Keep the fixture login usable with the password from this run. Only
      // the fixture alias above is ever touched.
      const passwordUpdate = await db.auth.admin.updateUserById(row.id, { password });
      if (passwordUpdate.error) {
        throw new Error(`Could not update the fixture password for ${spec.email}: ${passwordUpdate.error.message}`);
      }
      accountId.set(spec.key, row.id);
      accountLines.push(`  [reused]  ${spec.email}  ${spec.role}`);
    } else {
      const created = await db.auth.admin.createUser({
        email: spec.email,
        password,
        email_confirm: true,
      });
      if (created.error) {
        throw new Error(`Could not create ${spec.email}: ${created.error.message}`);
      }
      const inserted = await db
        .from("profiles")
        .insert({
          id: created.data.user.id,
          name: spec.name,
          email: spec.email,
          role: spec.role,
          residency_status: residencyFor(spec.role),
        })
        .select("id")
        .single();
      if (inserted.error) {
        // Do not leave an auth user without a profile behind.
        await db.auth.admin.deleteUser(created.data.user.id);
        throw new Error(
          `Created the login for ${spec.email} but could not save the profile; the login was removed: ` +
            inserted.error.message,
        );
      }
      accountId.set(spec.key, inserted.data.id);
      accountLines.push(`  [created] ${spec.email}  ${spec.role}`);
    }
  }

  // -------------------------------------------------------------- categories

  const categories = await db.from("categories").select("id, name");
  if (categories.error) throw new Error(categories.error.message);
  const categoryList = (categories.data ?? []) as { id: number; name: string }[];
  if (categoryList.length === 0) {
    throw new Error("No categories found. Apply the migrations first (see docs/API.md).");
  }
  const categoryIdByTitle = new Map<string, number>();
  for (const spec of REPORTS) {
    const match = categoryList.find((c) => c.name === spec.category);
    const chosen = match ?? categoryList[0]!;
    if (!match) {
      out(
        `Note: category "${spec.category}" was not found; using "${chosen.name}" for "${spec.title}".\n`,
      );
    }
    categoryIdByTitle.set(spec.title, chosen.id);
  }

  // RS-4: every new report has a main problem. The fixture takes its category's
  // first active problem type, which is the seed's most common one.
  const problems = await db.from("problem_types").select("id, category_id").eq("is_active", true).order("id");
  if (problems.error) throw new Error(problems.error.message);
  const mainProblemByCategory = new Map<number, number>();
  for (const problem of (problems.data ?? []) as { id: number; category_id: number }[]) {
    if (!mainProblemByCategory.has(problem.category_id)) mainProblemByCategory.set(problem.category_id, problem.id);
  }

  // ----------------------------------------------------------------- reports

  const reportLines: string[] = [];

  for (const spec of REPORTS) {
    const existing = await db
      .from("reports")
      .select("id, reference_code, citizen_id, assigned_staff_id, status, resolved_at, primary_problem_id")
      .eq("title", spec.title)
      .order("submitted_at")
      .limit(1)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);

    const citizenId = accountId.get(spec.owner)!;
    const staffId = spec.assigned ? accountId.get(spec.assigned)! : null;

    if (existing.data) {
      const row = existing.data as {
        id: string;
        reference_code: string;
        citizen_id: string;
        assigned_staff_id: string | null;
        status: string;
        resolved_at: string | null;
        primary_problem_id: number | null;
      };
      const fixes: Record<string, unknown> = {};
      if (row.primary_problem_id === null) {
        fixes.primary_problem_id = mainProblemByCategory.get(categoryIdByTitle.get(spec.title)!) ?? null;
      }
      if (row.citizen_id !== citizenId) fixes.citizen_id = citizenId;
      if ((row.assigned_staff_id ?? null) !== staffId) fixes.assigned_staff_id = staffId;
      if (row.status !== spec.status) {
        fixes.status = spec.status;
        // Fixture contract states are never 'resolved', so the timestamp must
        // be cleared to satisfy reports_resolved_at_matches_status.
        fixes.resolved_at = null;
      }
      if (Object.keys(fixes).length > 0) {
        const updated = await db.from("reports").update(fixes).eq("id", row.id);
        if (updated.error) throw new Error(updated.error.message);
      }
      reportLines.push(
        `  [reused]  ${row.reference_code}  "${spec.title}"  owner=${spec.owner}  ` +
          `assigned=${spec.assigned ?? "none"}  status=${spec.status}`,
      );
    } else {
      const inserted = await db
        .from("reports")
        .insert({
          title: spec.title,
          description: spec.description,
          citizen_id: citizenId,
          category_id: categoryIdByTitle.get(spec.title)!,
          primary_problem_id: mainProblemByCategory.get(categoryIdByTitle.get(spec.title)!) ?? null,
          assigned_staff_id: staffId,
          assigned_at: staffId ? new Date().toISOString() : null,
          status: spec.status,
          latitude: spec.latitude,
          longitude: spec.longitude,
          is_public: false,
        })
        .select("id, reference_code")
        .single();
      if (inserted.error) throw new Error(inserted.error.message);
      reportLines.push(
        `  [created] ${inserted.data.reference_code}  "${spec.title}"  owner=${spec.owner}  ` +
          `assigned=${spec.assigned ?? "none"}  status=${spec.status}`,
      );
    }
  }

  // ----------------------------------------------------------------- summary

  out(`\nFixture ready on project ${configured}.\n\nAccounts:\n${accountLines.join("\n")}\n\n`);
  out(`Reports:\n${reportLines.join("\n")}\n\n`);
  out(
    "The fixture password is the one you typed in this run; this command never stores, prints, or logs it.\n",
  );
}

main().catch((error: unknown) => {
  writeSync(2, `Fixture failed: ${error instanceof Error ? error.message : String(error)}\n`);
  exit(1);
});
