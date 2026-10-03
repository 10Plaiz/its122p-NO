import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// DM-1: records are never deleted. The API reaches the database only through
// supabase-js, so a table delete always looks like `.delete()` or
// `.delete({ count })` on a query builder. Two other calls share the name and stay
// allowed: Express's `router.delete("/path", ...)`, which always takes a path
// string (categories use it for their soft delete), and Storage's `.remove([...])`,
// which the retention purge uses to remove files while the rows stay.

const ROOT = resolve(import.meta.dir, "../..");
const MIGRATION = join(ROOT, "supabase/migrations/20261003000100_no_delete.sql");

// A delete with no argument, or an options object, is a query-builder delete.
const TABLE_DELETE = /\.delete\s*\(\s*(\)|\{)/g;

function withoutComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function tableDeletes(source: string) {
  return [...withoutComments(source).matchAll(TABLE_DELETE)].map((match) => match[0]);
}

function serverFiles(dir = join(ROOT, "src/server")): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return serverFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("DM-1 the detector tells table deletes from the allowed calls", () => {
  const flagged = [
    `await db.from("reports").delete().eq("id", id);`,
    `db.from("notifications")\n  .delete({ count: "exact" })\n  .in("id", ids);`,
    `const query = db.from("report_updates");\nawait query.delete();`,
  ];
  const allowed = [
    `router.delete("/:id", adminOnly, async (req, res) => {});`,
    `router.delete('/:id', handler);`,
    `await db.storage.from(PHOTO_BUCKET).remove(paths);`,
    `// a comment that mentions db.from("x").delete()`,
    `/* or a block comment: .delete() */`,
  ];

  for (const source of flagged) {
    test(`flags ${JSON.stringify(source.split("\n")[0])}`, () => {
      expect(tableDeletes(source)).toHaveLength(1);
    });
  }

  for (const source of allowed) {
    test(`allows ${JSON.stringify(source)}`, () => {
      expect(tableDeletes(source)).toEqual([]);
    });
  }
});

describe("DM-1 the server never deletes a database row", () => {
  const files = serverFiles();

  test("finds the server sources", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  test("no file in src/server calls .delete() on a table", () => {
    const offenders = files
      .filter((file) => tableDeletes(readFileSync(file, "utf8")).length > 0)
      .map((file) => relative(ROOT, file).replaceAll("\\", "/"));

    // Deactivate or change status instead; see categories.routes.ts for the pattern.
    expect(offenders).toEqual([]);
  });
});

describe("DM-1 the migration turns every cascade into a restrict", () => {
  const sql = readFileSync(MIGRATION, "utf8").replace(/--.*$/gm, "").replace(/\s+/g, " ").toLowerCase();

  const KEYS = [
    { table: "report_photos", column: "report_id", target: "public.reports" },
    { table: "report_updates", column: "report_id", target: "public.reports" },
    { table: "report_inspections", column: "report_id", target: "public.reports" },
    { table: "notifications", column: "user_id", target: "public.profiles" },
    { table: "notifications", column: "report_id", target: "public.reports" },
    { table: "profiles", column: "id", target: "auth.users" },
    // The two former "set null" keys; see the migration for why they restrict too.
    { table: "reports", column: "assigned_staff_id", target: "public.profiles" },
    { table: "activity_logs", column: "actor_id", target: "public.profiles" },
  ];

  for (const { table, column, target } of KEYS) {
    const name = `${table}_${column}_fkey`;

    test(`${table}.${column} → ${target} is replaced with on delete restrict`, () => {
      expect(sql).toContain(
        `alter table public.${table} drop constraint if exists ${name}, ` +
          `add constraint ${name} foreign key (${column}) references ${target} (id) on delete restrict;`,
      );
    });
  }

  test("adds report_photos.purged_at", () => {
    expect(sql).toContain("alter table public.report_photos add column if not exists purged_at timestamptz;");
  });

  test("never cascades or blanks rows itself", () => {
    expect(sql).not.toMatch(/on delete (cascade|set null|set default)/);
  });
});

describe("DM-1 later migrations do not bring cascading deletes back", () => {
  test("every migration after 20261003000100_no_delete.sql uses restrict", () => {
    const dir = join(ROOT, "supabase/migrations");
    const offenders = readdirSync(dir)
      .filter((name) => name.endsWith(".sql") && name > "20261003000100_no_delete.sql")
      .filter((name) => {
        const sql = readFileSync(join(dir, name), "utf8").replace(/--.*$/gm, "").toLowerCase();
        return /on\s+delete\s+(cascade|set\s+null|set\s+default)/.test(sql);
      });

    // A new key into reports or profiles must be ON DELETE RESTRICT (or omit the
    // clause, which means NO ACTION and also refuses the delete).
    expect(offenders).toEqual([]);
  });
});
