import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { signIn } from "./helpers.js";
import type { Profile } from "../../src/web/lib/types.js";

const evidence = "tests/evidence/pills-users-toolbar-2026-10-04";
const adminEmail = process.env.UI_AUDIT_ADMIN_EMAIL ?? "fixture-admin@kamoti.invalid";
const staffEmail = "demo-makati-staff-2@kamoti.invalid";
const pageErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("https://maps.googleapis.com/**", (route) => route.abort());
  // Account mutations are simulated locally; shared test accounts stay unchanged.
  await page.route("**/api/admin/users**", async (route) => {
    if (route.request().method() === "GET") return route.continue();
    return route.fulfill({ status: 503, json: { error: "Simulated account save failure." } });
  });
});

test.afterEach(() => expect(pageErrors).toEqual([]));

async function usersPage(page: Page) {
  await signIn(page, adminEmail);
  await page.goto("/admin/users");
  await expect(page.getByRole("table", { name: "User accounts" })).toBeVisible();
}

async function rightmostSearch(search: Locator) {
  const result = await search.evaluate((input) => {
    const toolbar = input.closest('[role="group"]') ?? input.closest(".grid");
    if (!toolbar) throw new Error("Search has no toolbar.");
    const box = input.getBoundingClientRect();
    const neighbors = Array.from(toolbar.querySelectorAll("input, select, button"))
      .filter((control) => control !== input)
      .map((control) => control.getBoundingClientRect())
      .filter((other) => other.width > 0 && Math.abs(other.bottom - box.bottom) < 2);
    return {
      lastInReadingOrder: toolbar.lastElementChild?.contains(input),
      rightmostOnRow: neighbors.every((other) => other.right <= box.left + 1),
    };
  });
  expect(result).toEqual({ lastInReadingOrder: true, rightmostOnRow: true });
}

async function readablePill(pill: Locator) {
  const result = await pill.evaluate((element) => {
    const style = getComputedStyle(element);
    const channels = (color: string) => color.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [];
    const luminance = (color: string) => {
      const [red, green, blue] = channels(color).map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return red * 0.2126 + green * 0.7152 + blue * 0.0722;
    };
    const foreground = luminance(style.color);
    const background = luminance(style.backgroundColor);
    return {
      contrast: (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05),
      rounded: Number.parseFloat(style.borderRadius) >= element.getBoundingClientRect().height / 2,
      border: style.borderTopWidth,
      tabIndex: element.getAttribute("tabindex"),
      tag: element.tagName,
      color: style.color,
      background: style.backgroundColor,
    };
  });
  expect(result.contrast).toBeGreaterThanOrEqual(4.5);
  expect(result.rounded).toBe(true);
  expect(result.border).toBe("0px");
  expect(result.tabIndex).toBeNull();
  expect(result.tag).toBe("SPAN");
  return result;
}

test("Public report pills stay readable and search follows all filters", async ({ page }) => {
  await page.goto("/board");
  await expect(page.locator("main .status-pill").first()).toBeVisible();
  await rightmostSearch(page.getByRole("searchbox"));
  const pill = page.locator("main .status-pill").first();
  const before = await readablePill(pill);
  await pill.hover();
  const after = await readablePill(pill);
  expect(after.color).toBe(before.color);
  expect(after.background).toBe(before.background);
  const filtered = page.waitForResponse((response) => response.url().includes("/api/public/reports") && new URL(response.url()).searchParams.get("status") === "resolved");
  await page.locator("#status").selectOption("resolved");
  expect((await filtered).ok()).toBe(true);
  await expect(page.locator("main .status-pill").filter({ hasNotText: "Resolved" })).toHaveCount(0);
  await readablePill(page.locator("main .status-pill").first());
  await page.screenshot({ path: `${evidence}/board-pills-desktop.png`, fullPage: false });
  await page.getByRole("searchbox").fill("no-such-public-report-73824");
  await expect(page.getByRole("heading", { name: "Nothing matches this view", exact: true })).toBeVisible();
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await rightmostSearch(page.getByRole("searchbox"));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});

test("Users support combined search, clear filters, self restrictions, and mobile routing", async ({ page }) => {
  await usersPage(page);
  await rightmostSearch(page.getByRole("searchbox"));
  await page.getByRole("searchbox").fill(adminEmail.toUpperCase());
  const ownRow = page.getByRole("row").filter({ hasText: adminEmail });
  await expect(ownRow.getByRole("button", { name: /^Change role/ })).toBeDisabled();
  await expect(ownRow.getByRole("button", { name: /^Deactivate/ })).toBeDisabled();
  await expect(ownRow).toContainText("your own role");
  await page.getByRole("searchbox").fill(staffEmail);
  await page.locator("#role-filter").selectOption("citizen");
  await expect(page.getByRole("heading", { name: "No accounts match your filters" })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.locator("#role-filter")).toHaveValue("");
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await page.locator("#residency-filter").selectOption("pending");
  await page.locator("#role-filter").selectOption("staff");
  await expect(page.locator("#residency-filter")).toHaveValue("");
  await expect(page.locator("#residency-filter")).toBeDisabled();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await page.getByRole("searchbox").fill("demo-makati-");
  await expect(page.getByRole("table", { name: "User accounts" })).toBeVisible();
  for (const width of [320, 375, 414, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await rightmostSearch(page.getByRole("searchbox"));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const visible = page.locator("main .status-pill:visible");
    for (const pill of await visible.all()) await readablePill(pill);
  }
  await page.screenshot({ path: `${evidence}/users-desktop.png`, fullPage: false });
  await page.getByRole("searchbox").fill(staffEmail);
  await page.setViewportSize({ width: 375, height: 900 });
  const staffRow = page.getByRole("row").filter({ hasText: staffEmail });
  await staffRow.getByRole("button", { name: /^Routing/ }).click();
  await expect(staffRow.getByRole("button", { name: /^Close routing/ })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Save specializations", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.screenshot({ path: `${evidence}/users-routing-mobile.png`, fullPage: true });
});

test("Account activation asks first, traps focus, and retains state after failure", async ({ page }) => {
  await usersPage(page);
  await page.getByRole("searchbox").fill(staffEmail);
  let sends = 0;
  let requestBody: unknown;
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/admin/users/*", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    sends++;
    requestBody = route.request().postDataJSON();
    await held;
    await route.fulfill({ status: 500, json: { error: "The account could not be saved. Try again." } });
  });
  const trigger = page.getByRole("button", { name: /^Deactivate/ });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
  const confirm = dialog.getByRole("button", { name: "Deactivate account", exact: true });
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cancel).toBeFocused();
  expect(sends).toBe(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await confirm.click();
  await expect(dialog).toHaveAttribute("aria-busy", "true");
  await expect(cancel).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  expect(sends).toBe(1);
  expect(requestBody).toEqual({ is_active: false });
  release();
  await expect(dialog.getByRole("alert")).toContainText("The account could not be saved");
  await expect(page.locator(".account-table .status-pill-success").filter({ hasText: "Active" })).toBeVisible();
  await page.screenshot({ path: `${evidence}/deactivation-failure.png`, fullPage: false });
  await page.setViewportSize({ width: 320, height: 900 });
  const box = await dialog.boundingBox();
  if (!box) throw new Error("The confirmation dialog has no visible bounds.");
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  expect(Math.abs(box.x + box.width / 2 - 160)).toBeLessThan(1);
  expect(Math.abs(box.y + box.height / 2 - 450)).toBeLessThan(1);
  await page.screenshot({ path: `${evidence}/deactivation-failure-mobile.png`, fullPage: false });
  await cancel.click();
  await expect(dialog).toBeHidden();
  expect(sends).toBe(1);
});

test("Role edits discard cancelled changes and account creation preserves failed input", async ({ page }) => {
  await usersPage(page);
  await page.getByRole("searchbox").fill(staffEmail);
  await page.getByRole("button", { name: /^Change role/ }).click();
  const role = page.getByRole("combobox", { name: /^Role for/ });
  await expect(role).toHaveValue("staff");
  await expect(page.getByRole("button", { name: "Save role", exact: true })).toBeDisabled();
  await role.selectOption("admin");
  await page.getByRole("button", { name: "Save role", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Simulated account save failure");
  await expect(role).toHaveValue("admin");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: /^Change role/ }).click();
  await expect(role).toHaveValue("staff");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "New account", exact: true }).click();
  const form = page.getByRole("form", { name: "New account", exact: true });
  await expect(page.locator("#new-first-name")).toBeFocused();
  await page.locator("#new-email").fill("invalid");
  await page.locator("#new-email").blur();
  await expect(page.locator("#new-email")).toHaveAttribute("aria-invalid", "true");
  await expect(form.getByRole("button", { name: "Create account" })).toBeDisabled();
  await page.locator("#new-first-name").fill("UI");
  await page.locator("#new-last-name").fill("Check");
  await page.locator("#new-email").fill("ui-only-check@kamoti.invalid");
  await page.locator("#new-password").fill("UiCheck#2026");
  await page.locator("#new-password").press("Enter");
  await expect(form.getByRole("alert")).toContainText("Simulated account save failure");
  await expect(page.locator("#new-email")).toHaveValue("ui-only-check@kamoti.invalid");
  await expect(page.locator("#new-password")).toHaveValue("UiCheck#2026");
  await page.locator("#new-email").fill("ui-corrected@kamoti.invalid");
  await expect(form.getByRole("alert")).toHaveCount(0);
  await form.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole("button", { name: "New account", exact: true })).toBeFocused();
});

test("Simulated reactivation and phone verification retain the correct status labels", async ({ page }) => {
  await signIn(page, adminEmail);
  let user: Profile = {
    id: "d0261004-0000-4000-8000-000000000001",
    name: "Inactive UI check",
    email: "ui-states@kamoti.invalid",
    role: "staff",
    is_active: false,
    contact_number: "09170000001",
    phone_verified_at: null,
    created_at: "2026-10-04T00:00:00Z",
  };
  await page.route("**/api/admin/users**", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { users: [user] } });
    if (route.request().url().endsWith("/phone-verified")) {
      expect(route.request().postDataJSON()).toEqual({ verified: true });
      return route.fulfill({ status: 503, json: { error: "Mobile verification could not be saved." } });
    }
    expect(route.request().method()).toBe("PATCH");
    expect(route.request().postDataJSON()).toEqual({ is_active: true });
    user = { ...user, is_active: true };
    return route.fulfill({ json: { user } });
  });
  await page.goto("/admin/users");
  await expect(page.locator("main .status-pill-neutral").filter({ hasText: "Deactivated" })).toBeVisible();
  await page.locator("#user-status-filter").selectOption("active");
  await expect(page.getByRole("heading", { name: "No accounts match your filters" })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await page.getByRole("searchbox").fill("09170000001");
  await expect(page.getByRole("row").filter({ hasText: "ui-states@kamoti.invalid" })).toBeVisible();
  await page.getByRole("button", { name: /^Reactivate Inactive/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("able to sign in again");
  await dialog.getByRole("button", { name: "Reactivate account", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".account-table .status-pill-success").filter({ hasText: "Active" })).toBeVisible();
  await page.getByRole("button", { name: /^Mark verified/ }).click();
  await expect(page.getByRole("alert")).toContainText("Mobile verification could not be saved");
  await expect(page.locator("main .status-pill-warning")).toHaveText("Number not verified");
  await page.screenshot({ path: `${evidence}/simulated-phone-failure.png`, fullPage: false });
});

test("Account creation blocks duplicate submission and closing while sending", async ({ page }) => {
  await usersPage(page);
  let sends = 0;
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/\/api\/admin\/users$/, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    sends++;
    await held;
    await route.fulfill({ status: 409, json: {
      error: "This email is already registered.",
      details: [{ field: "email", message: "Choose another email address." }],
    } });
  });
  await page.getByRole("button", { name: "New account", exact: true }).click();
  await page.locator("#new-first-name").fill("UI");
  await page.locator("#new-last-name").fill("Check");
  await page.locator("#new-email").fill("ui-pending@kamoti.invalid");
  await page.locator("#new-password").fill("UiCheck#2026");
  const form = page.getByRole("form", { name: "New account", exact: true });
  await form.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(form).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("#new-first-name")).toBeDisabled();
  await expect(form.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
  await page.keyboard.press("Enter");
  expect(sends).toBe(1);
  release();
  await expect(page.locator("#new-email")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#new-email-note")).toHaveText("Choose another email address.");
  await expect(page.locator("#new-password")).toHaveValue("UiCheck#2026");
  expect(sends).toBe(1);
  await expect(form.getByRole("button", { name: "Create account", exact: true })).toBeDisabled();
  await page.locator("#new-password").fill("UiCorrected#2026");
  await expect(page.locator("#new-email-note")).toHaveText("Choose another email address.");
  await page.locator("#new-email").fill("ui-corrected@kamoti.invalid");
  await expect(page.locator("#new-email")).not.toHaveAttribute("aria-invalid", "true");
  await expect(form.getByRole("button", { name: "Create account", exact: true })).toBeEnabled();
  await form.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("User load failures offer retry and never claim an empty result", async ({ page }) => {
  await signIn(page, adminEmail);
  let mode: "error" | "real" | "empty" = "error";
  await page.route(/\/api\/admin\/users(?:\?|$)/, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    if (mode === "real") return route.continue();
    await route.fulfill(mode === "error"
      ? { status: 503, json: { error: "Users are temporarily unavailable." } }
      : { status: 200, json: { users: [] } });
  });
  await page.goto("/admin/users");
  await expect(page.getByRole("alert")).toContainText("Users are temporarily unavailable");
  await expect(page.getByRole("heading", { name: /^No .*accounts/ })).toHaveCount(0);
  mode = "real";
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("table", { name: "User accounts" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  mode = "empty";
  // Local filters reuse the loaded list. Reload to exercise an empty API response.
  await page.reload();
  await expect(page.getByRole("heading", { name: "No user accounts yet" })).toBeVisible();
  await page.locator("#role-filter").selectOption("citizen");
  await expect(page.getByRole("heading", { name: "No accounts match your filters" })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No user accounts yet" })).toBeVisible();
});

test("Admin search rows and other status consumers use the shared conventions", async ({ page }) => {
  await signIn(page, adminEmail);
  for (const path of ["/admin/reports", "/admin/logs"]) {
    await page.goto(path);
    await rightmostSearch(page.getByRole("searchbox"));
  }
  await page.goto("/admin/categories");
  await expect(page.locator("main .status-pill").first()).toBeVisible();
  await readablePill(page.locator("main .status-pill").first());
  await page.goto("/notifications");
  await expect(page.locator("main .status-pill-info").first()).toBeVisible();
  await readablePill(page.locator("main .status-pill-info").first());
});

test("Staff queue uses the same pills and search order on desktop and phones", async ({ page }) => {
  await signIn(page, staffEmail);
  await page.goto("/staff/queue");
  await expect(page.locator("main .status-pill:visible").first()).toBeVisible();
  await rightmostSearch(page.getByRole("searchbox"));
  await readablePill(page.locator("main .status-pill:visible").first());
  await page.setViewportSize({ width: 320, height: 900 });
  await rightmostSearch(page.getByRole("searchbox"));
  await readablePill(page.locator("main .status-pill:visible").first());
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({ path: `${evidence}/staff-pills-mobile.png`, fullPage: false });
});
