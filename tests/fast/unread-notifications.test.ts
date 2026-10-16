import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { once } from "node:events";
import type { Server } from "node:http";

process.env.SUPABASE_URL ??= "https://placeholder.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "placeholder-publishable-key";
process.env.SUPABASE_SECRET_KEY ??= "placeholder-secret-key";
const { app } = await import("../../src/server/app.js");
const { db } = await import("../../src/server/config/supabase.js");
const { createUnreadCount } = await import("../../src/web/lib/notifications.js");

const USER = "d0000000-0000-4000-8000-000000000083";
const PROFILE = {
  id: USER, name: "Fixture Administrator", email: "admin@kamoti.invalid", role: "admin", is_active: true,
  residency_status: null, residency_proof_path: null, residency_review_version: null, residency_proof_id: null,
};

// 60 notifications, newest first by id: the newest 50 hold 45 unread, all 60 hold 54.
const NOTIFICATIONS = Array.from({ length: 60 }, (_, i) => ({
  id: 60 - i,
  user_id: USER,
  message: `Notification ${60 - i}`,
  is_read: i % 10 === 9,
  created_at: new Date(Date.UTC(2026, 9, 16, 0, 60 - i)).toISOString(),
  report_id: null,
}));

// Just enough of a PostgREST builder for the profile lookup and the notification reads.
function table(name: string) {
  const filters: [string, unknown][] = [];
  let head = false;
  let updating = false;
  let limit = Infinity;
  const builder = {
    update: () => ((updating = true), builder),
    select: (_columns: string, options?: { head?: boolean }) => ((head = Boolean(options?.head)), builder),
    eq: (column: string, value: unknown) => (filters.push([column, value]), builder),
    order: () => builder,
    limit: (n: number) => ((limit = n), builder),
    single: async () => ({ data: name === "profiles" ? PROFILE : null, error: null }),
    then(resolve: (value: unknown) => void) {
      // supabase-js answers an update with no select with data: null.
      if (updating) return resolve({ data: null, count: null, error: null });
      const rows = NOTIFICATIONS.filter((row) => filters.every(([column, value]) => row[column as keyof typeof row] === value));
      resolve(head ? { data: null, count: rows.length, error: null } : { data: rows.slice(0, limit), count: null, error: null });
    },
  };
  return builder;
}

const original = { from: db.from, getUser: db.auth.getUser };
let server: Server;
let base: string;

beforeAll(async () => {
  db.from = table as unknown as typeof db.from;
  db.auth.getUser = (async () => ({ data: { user: { id: USER } }, error: null })) as unknown as typeof db.auth.getUser;
  server = app.listen(0);
  await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

afterAll(() => {
  db.from = original.from;
  db.auth.getUser = original.getUser;
  server.close();
});

const auth = { Authorization: "Bearer token" };
const get = async (path: string) => (await fetch(`${base}${path}`, { headers: auth })).json();

describe("#83 unread notifications", () => {
  test("the inbox lists the newest 50 but counts every unread notification", async () => {
    const body = (await get("/api/notifications")) as { notifications: unknown[]; unread: number };
    expect(body.notifications).toHaveLength(50);
    expect(body.unread).toBe(54);
  });

  test("the badge reads the count alone", async () => {
    expect(await get("/api/notifications/unread")).toEqual({ unread: 54 });
  });

  test("Mark all as read answers 204, so the page reloads instead of showing an error", async () => {
    const response = await fetch(`${base}/api/notifications/read-all`, { method: "PATCH", headers: auth });
    expect(response.status).toBe(204);
  });

  test("the badge takes the newest answer, so a late one cannot restore a cleared count", async () => {
    const answers: ((count: number) => void)[] = [];
    const unread = createUnreadCount(() => new Promise<number>((resolve) => answers.push(resolve)));
    const seen: (number | null)[] = [];
    unread.subscribe(() => seen.push(unread.countFor("a")));

    const before = unread.recheck("a"); // asked before Mark all as read
    const after = unread.recheck("a"); // asked after it
    answers[1]!(0);
    await after;
    answers[0]!(12);
    await before;

    expect(unread.countFor("a")).toBe(0);
    expect(seen).toEqual([0]);
  });

  test("the count belongs to the account that asked, and a failed check keeps the last count", async () => {
    let next: () => Promise<number> = async () => 4;
    const unread = createUnreadCount(() => next());
    await unread.recheck("a");
    expect(unread.countFor("a")).toBe(4);
    expect(unread.countFor("b")).toBeNull();

    next = async () => {
      throw new Error("offline");
    };
    await unread.recheck();
    expect(unread.countFor("a")).toBe(4);

    next = async () => 1;
    await unread.recheck(); // the last account that asked
    expect(unread.countFor("a")).toBe(1);
  });
});
