import { expect, test, type Page } from "@playwright/test";
import type { Profile } from "../../src/web/lib/types.js";

const VERSION = "11111111-1111-4111-8111-111111111111";
const admin = { id: "admin", name: "Recovery Administrator", email: "admin@kamoti.invalid", role: "admin", is_active: true,
  residency_review_version: VERSION, residency_proof_id: null } satisfies Profile;
const citizen = (id: number): Profile => ({
  id: `citizen-${id}`, name: `Citizen ${String(id).padStart(2, "0")}`, email: `citizen${id}@kamoti.invalid`,
  role: "citizen", is_active: true, contact_number: "09171234567", phone_verified_at: null,
  residency_status: "pending", has_residency_proof: false, residency_review_version: VERSION, residency_proof_id: null,
  address_line: "10 Sample Street", barangay: "Poblacion", created_at: new Date(Date.UTC(2026, 0, id)).toISOString(),
});
type State = { users: Profile[]; failList: boolean; failMutation: boolean; hold: Promise<void> | null; writes: { path: string; body: unknown }[] };
async function fixture(page: Page) {
  const state: State = { users: [...Array.from({ length: 45 }, (_, i) => citizen(i + 1)),
    { ...citizen(46), created_at: undefined }, { ...citizen(47), is_active: false },
    { ...citizen(48), id: "staff", name: "Routing Staff", role: "staff" }, admin],
    failList: false, failMutation: false, hold: null, writes: [] };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const reply = (json: unknown, status = 200) => route.fulfill({ json, status });
    if (path === "/api/auth/login" || path === "/api/auth/me") return reply({ user: admin, access_token: "fixture-token", expires_at: Math.floor(Date.now() / 1000) + 3600 });
    if (path === "/api/notifications/unread") return reply({ unread: 0 });
    if (path === "/api/admin/users" && route.request().method() === "GET") return state.failList ? reply({ error: "Fixture list failure" }, 503) : reply({ users: state.users });
    if (route.request().method() === "PATCH" && path.startsWith("/api/admin/users/")) {
      const body: Record<string, unknown> = route.request().postDataJSON();
      state.writes.push({ path, body });
      if (state.hold) await state.hold;
      if (state.failMutation) return reply({ error: "Fixture save failed. Try again." }, 503);
      const user = state.users.find((user) => path.split("/")[4] === user.id);
      if (!user) return reply({ error: "No fixture user" }, 404);
      if (path.endsWith("/phone-verified")) user.phone_verified_at = body.verified ? "2026-10-16T00:00:00Z" : null;
      else if (path.endsWith("/residency")) user.residency_status = body.decision === "verified" ? "verified" : "rejected";
      else {
        if (body.role === "citizen" || body.role === "staff" || body.role === "admin") user.role = body.role;
        if (typeof body.is_active === "boolean") user.is_active = body.is_active;
      }
      return reply({ user });
    }
    if (path === "/api/categories") return reply({ categories: [] });
    if (path === "/api/staff/staff/specializations") return reply({ specializations: [] });
    if (path === "/api/staff/staff/areas") return reply({ areas: [] });
    throw new Error(`Unhandled fixture request ${route.request().method()} ${path}`);
  });
  await page.goto("/signin");
  await page.getByLabel(/^Email/).fill(admin.email);
  await page.getByLabel(/^Password/).fill("Password123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.goto("/admin/users");
  await expect(page.getByRole("table", { name: "User accounts" })).toBeVisible();
  return state;
}
const row = (page: Page, name = "Citizen 45") => page.getByRole("row").filter({ has: page.getByRole("rowheader", { name, exact: true }) });
async function action(page: Page, name: string, user = "Citizen 45") {
  await page.getByRole("button", { name: `Actions for ${user}`, exact: true }).click();
  await page.getByRole("group", { name: "Account actions", exact: true }).getByRole("button", { name: new RegExp(`^${name}`) }).click();
}
const pager = (page: Page) => page.getByRole("navigation", { name: "User accounts pagination" });

const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  runtimeErrors.set(page, errors);
});
test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([]);
});

test("defaults, full-list sorting, unknown dates, paging, URL composition and history", async ({ page }) => {
  await fixture(page);
  await expect(page.getByLabel("Role", { exact: true })).toHaveValue("citizen");
  await expect(page.getByLabel("Account status", { exact: true })).toHaveValue("active");
  await expect(page.getByRole("rowheader")).toHaveCount(20);
  await expect(page.getByRole("rowheader").first()).toHaveText("Citizen 45");
  await expect(pager(page)).toContainText("1–20 of 46");
  await pager(page).getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("rowheader").first()).toHaveText("Citizen 25");
  await page.reload();
  await expect(page.getByRole("rowheader").first()).toHaveText("Citizen 25");
  await page.getByLabel("Date joined", { exact: true }).selectOption("oldest");
  await expect(page.getByRole("rowheader").first()).toHaveText("Citizen 01");
  await expect(page).not.toHaveURL(/page=/);
  await pager(page).getByLabel("Go to page").fill("99");
  await pager(page).getByRole("button", { name: "Go", exact: true }).click();
  await expect(pager(page).getByRole("alert")).toContainText("Enter a page from 1 to 3");
  await pager(page).getByLabel("Go to page").fill("3");
  await pager(page).getByRole("button", { name: "Go", exact: true }).click();
  await expect(page.getByRole("rowheader").last()).toHaveText("Citizen 46");
  await page.goBack();
  await expect(page.getByRole("rowheader").first()).toHaveText("Citizen 01");
  await page.evaluate(() => {
    for (const [id, value] of [["role-filter", ""], ["user-status-filter", ""], ["user-joined-sort", "newest"]]) {
      const control = document.getElementById(id);
      if (!(control instanceof HTMLSelectElement)) throw new Error("Missing filter");
      control.value = value; control.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await expect(page).toHaveURL(/role=all/);
  await expect(page).toHaveURL(/status=all/);
  await expect(page.getByLabel("Date joined", { exact: true })).toHaveValue("newest");
  await page.getByLabel("Search", { exact: true }).fill("citizen1@kamoti.invalid");
  await expect(page.getByRole("rowheader")).toHaveText(["Citizen 01"]);
});

test("filter counts, clearing retains order, staff eligibility, empty and retry", async ({ page }) => {
  const state = await fixture(page);
  await expect(page.getByRole("option", { name: "Every role (48)", exact: true })).toHaveCount(1);
  await page.getByLabel("Date joined", { exact: true }).selectOption("oldest");
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.getByLabel("Date joined", { exact: true })).toHaveValue("oldest");
  await expect(page.getByLabel("Role", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Account status", { exact: true })).toHaveValue("");
  await page.getByLabel("Role", { exact: true }).selectOption("staff");
  await expect(page.getByLabel("Residency", { exact: true })).toBeDisabled();
  await page.getByLabel("Search", { exact: true }).fill("missing");
  await expect(page.getByRole("heading", { name: "No accounts match your filters" })).toBeVisible();
  state.failList = true;
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Fixture list failure");
  state.failList = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.getByRole("rowheader")).toHaveCount(20);
});

test("role dialog keeps saved role, resets on cancel, contains focus and retries a pending failure", async ({ page }) => {
  const state = await fixture(page);
  await action(page, "Change role");
  const dialog = page.getByRole("dialog");
  const role = dialog.getByLabel("Role for Citizen 45", { exact: true });
  await expect(role).toBeFocused();
  await role.selectOption("staff");
  await expect(row(page).locator('[data-label="Role"]')).toHaveText("Citizen");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("button", { name: "Actions for Citizen 45", exact: true })).toBeFocused();
  await action(page, "Change role");
  await expect(role).toHaveValue("citizen");
  await role.selectOption("staff");
  let release = () => {};
  state.hold = new Promise<void>((resolve) => { release = resolve; }); state.failMutation = true;
  await dialog.getByRole("button", { name: "Save role", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.mouse.click(1, 1);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Saving…" })).toBeDisabled();
  expect(state.writes).toHaveLength(1);
  release();
  await expect(dialog.getByRole("alert")).toContainText("Fixture save failed");
  await expect(row(page).locator('[data-label="Role"]')).toHaveText("Citizen");
  state.failMutation = false; state.hold = null;
  await dialog.getByRole("button", { name: "Save role", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("rowheader", { name: "Citizen 45", exact: true })).toHaveCount(0);
  expect(state.writes).toHaveLength(2);
});

test("details move phone confirmation out of menu and protect pending failure and retry", async ({ page }) => {
  const state = await fixture(page);
  await page.getByRole("button", { name: "Actions for Citizen 45", exact: true }).click();
  const menu = page.getByRole("group", { name: "Account actions", exact: true });
  await expect(menu.getByRole("button")).toHaveCount(4);
  await menu.getByRole("button", { name: /^View details/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Mark phone verified", exact: true })).toBeFocused();
  let release = () => {}; state.hold = new Promise<void>((resolve) => { release = resolve; }); state.failMutation = true;
  await dialog.getByRole("button", { name: "Mark phone verified", exact: true }).click();
  await page.keyboard.press("Escape"); await page.mouse.click(1, 1);
  await expect(dialog).toBeVisible(); expect(state.writes).toHaveLength(1);
  release();
  await expect(dialog.getByRole("alert")).toContainText("Fixture save failed");
  await expect(dialog).toContainText("Not confirmed");
  state.hold = null; state.failMutation = false;
  await dialog.getByRole("button", { name: "Mark phone verified", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row(page).locator('[data-label="Phone"]')).toContainText("Confirmed by staff");
  expect(state.writes).toHaveLength(2);
});

test("activation confirmation, self guards, staff routing and latest creation controls", async ({ page }) => {
  const state = await fixture(page);
  await action(page, "Deactivate");
  await expect(page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await page.getByRole("dialog").getByRole("button", { name: "Deactivate account", exact: true }).click();
  await expect(row(page)).toHaveCount(0);
  await page.getByLabel("Account status", { exact: true }).selectOption("deactivated");
  await expect(row(page)).toBeVisible();
  await action(page, "Reactivate");
  await page.getByRole("dialog").getByRole("button", { name: "Reactivate account", exact: true }).click();
  await expect(row(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await page.getByLabel("Role", { exact: true }).selectOption("admin");
  await page.getByRole("button", { name: `Actions for ${admin.name}`, exact: true }).click();
  const menu = page.getByRole("group", { name: "Account actions", exact: true });
  await expect(menu.getByRole("button")).toHaveCount(3);
  await expect(menu.getByRole("button", { name: /^Change role/ })).toBeDisabled();
  await expect(menu.getByRole("button", { name: /^Deactivate/ })).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.getByLabel("Role", { exact: true }).selectOption("staff");
  await action(page, "Manage routing", "Routing Staff");
  await expect(page.getByText("Specializations for Routing Staff", { exact: true })).toBeVisible();
  await expect(pager(page).getByRole("button", { name: "Next", exact: true })).toHaveCount(0);
  await action(page, "Close routing", "Routing Staff");
  await page.getByRole("button", { name: "New account", exact: true }).click();
  await page.getByLabel("Suffix", { exact: true }).fill("Jr.");
  await expect(page.getByLabel("Suffix", { exact: true })).toHaveValue("Jr.");
  await page.locator("#new-contact").fill("0917123456789012");
  await expect(page.locator("#new-contact")).toHaveValue("09171234567");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(state.writes).toHaveLength(2);
});

test("residency uses native modal and retains versioned no-document evidence on pending failure", async ({ page }) => {
  const state = await fixture(page);
  await action(page, "Review residency");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "Approve without a document…", exact: true }).click();
  const note = dialog.getByLabel("How you confirmed this resident");
  await note.fill("Inspected the original sample barangay certificate.");
  let release = () => {}; state.hold = new Promise<void>((resolve) => { release = resolve; }); state.failMutation = true;
  await dialog.getByRole("button", { name: "Approve without a document", exact: true }).click();
  await page.keyboard.press("Escape"); await page.mouse.click(1, 1);
  await expect(dialog).toBeVisible(); expect(state.writes).toHaveLength(1);
  expect(state.writes[0].body).toEqual({ decision: "verified", expected_version: VERSION, method: "no_document", note: "Inspected the original sample barangay certificate." });
  release(); await expect(dialog.getByRole("alert")).toContainText("Fixture save failed");
  await expect(note).toHaveValue("Inspected the original sample barangay certificate.");
  state.hold = null; state.failMutation = false;
  await dialog.getByRole("button", { name: "Approve without a document", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row(page).locator('[data-label="Residency"]')).toContainText("Verified");
});

test("responsive cards, contained tablet scroll, long values and popover geometry", async ({ page }) => {
  const state = await fixture(page);
  const name = "Long".repeat(40);
  state.users = [{ ...citizen(45), name, email: `${"long".repeat(40)}@kamoti.invalid` }];
  await page.reload();
  for (const width of [320, 375, 414, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("rowheader")).toHaveText(name);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (width === 768) expect(await page.getByRole("region", { name: "User account columns" }).evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    const before = await row(page, name).boundingBox();
    await page.getByRole("button", { name: `Actions for ${name}`, exact: true }).click();
    const menu = page.getByRole("group", { name: "Account actions", exact: true });
    const bounds = await menu.boundingBox();
    expect(bounds).not.toBeNull();
    if (bounds) { expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width); }
    expect((await row(page, name).boundingBox())?.height).toBe(before?.height);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: `Actions for ${name}`, exact: true })).toBeFocused();
  }
  state.users = [citizen(45), citizen(44), { ...citizen(43), residency_status: "verified" }];
  await page.reload();
  await page.screenshot({ path: "tests/evidence/admin-users-recovery/users-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 900 });
  await action(page, "View details");
  await page.screenshot({ path: "tests/evidence/admin-users-recovery/details-mobile.png", fullPage: true });
});
