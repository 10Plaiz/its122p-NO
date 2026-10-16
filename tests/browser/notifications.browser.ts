import { test, expect } from "@playwright/test";
import { apiToken, bearer, FIXTURE_PASSWORD, MAKATI_POINT, signIn, TEST_TITLE_PREFIX, USERS } from "./helpers.js";

// #83: the menu badge counts unread notifications and follows every way of reading
// them, without a reload. Staff 2 starts from zero, then gets notifications on a
// [TEST] report this run owns: the citizen's comments notify the assigned staff member.
test("#83: the menu badge follows the unread count as notifications are read", async ({ page, request }) => {
  const citizen = await apiToken(request, USERS.citizen1);
  const admin = await apiToken(request, USERS.admin);
  const staff = await apiToken(request, USERS.staff2);
  expect((await request.patch("/api/notifications/read-all", { headers: bearer(staff) })).status()).toBe(204);

  const categories = (await (await request.get("/api/categories")).json()).categories as { id: number; is_active: boolean }[];
  const category = categories.find((c) => c.is_active)!;
  const groups = (await (await request.get("/api/reports/meta/problem-types", { headers: bearer(citizen) })).json()).groups as {
    category_id: number;
    problem_types: { id: number }[];
  }[];
  const problem = groups.find((g) => g.category_id === category.id)!.problem_types[0]!;
  const created = await request.post("/api/reports", {
    headers: bearer(citizen),
    data: { title: `${TEST_TITLE_PREFIX} Notification badge`, description: "Automated check of the unread badge.", category_id: category.id, primary_problem_id: problem.id, ...MAKATI_POINT },
  });
  expect(created.status()).toBe(201);
  const reportId = ((await created.json()) as { report: { id: string } }).report.id;
  const staffList = (await (await request.get("/api/staff", { headers: bearer(admin) })).json()).staff as { id: string; email: string }[];
  const staffId = staffList.find((s) => s.email === USERS.staff2)!.id;
  expect((await request.patch(`/api/reports/${reportId}/assign`, { headers: bearer(admin), data: { staff_id: staffId, details: "Nearest crew." } })).ok()).toBe(true);
  for (const n of [1, 2, 3]) {
    const comment = await request.post(`/api/reports/${reportId}/remarks`, { headers: bearer(citizen), data: { details: `Still broken, check ${n}.` } });
    expect(comment.ok()).toBe(true);
  }
  const unread = (await (await request.get("/api/notifications/unread", { headers: bearer(staff) })).json()).unread as number;
  expect(unread).toBeGreaterThanOrEqual(3);

  await page.context().clearCookies();
  await signIn(page, USERS.staff2, FIXTURE_PASSWORD);
  const badge = page.getByRole("link", { name: /^Notifications/ }).locator(".status-pill");
  await expect(badge).toHaveText(String(unread));

  await page.goto("/notifications");
  await page.getByRole("button", { name: "Mark notification as read" }).first().click();
  await expect(badge).toHaveText(String(unread - 1));

  // Opening a report from a notification reads it.
  const stillUnread = page.locator("article", { has: page.getByRole("button", { name: "Mark notification as read" }) });
  await stillUnread.getByRole("link", { name: /^Open report/ }).first().click();
  await page.waitForURL(/\/staff\/reports\//);
  await expect(badge).toHaveText(String(unread - 2));

  await page.goto("/notifications");
  await page.getByRole("button", { name: "Mark all as read" }).click();
  await expect(page.getByText("You are up to date.")).toBeVisible();
  await expect(page.getByText("Could not mark them read")).toHaveCount(0);
  await expect(badge).toHaveCount(0);
});
