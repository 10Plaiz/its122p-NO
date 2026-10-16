import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

const profile = {
  id: "suffix-fixture", name: "Ana Reyes", first_name: "Ana", middle_name: null,
  last_name: "Reyes", suffix: null, email: "ana@kamoti.invalid", role: "citizen",
  is_active: true, barangay: "Poblacion", address_line: "12 J.P. Rizal Street",
  contact_number: null, residency_status: "verified", has_residency_proof: true,
};
const runtimeErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me") return route.fulfill({ json: { user: profile } });
    if (path === "/api/auth/login") return route.fulfill({ json: {
      user: profile, access_token: "suffix-simulated", expires_at: Math.floor(Date.now() / 1000) + 3600,
    } });
    if (path === "/api/notifications") return route.fulfill({ json: { notifications: [], unread: 0 } });
    if (path === "/api/admin/users") return route.fulfill({ json: { users: [] } });
    return route.fulfill({ status: 400, json: { error: `Unexpected suffix fixture request: ${path}` } });
  });
  test.info().annotations.push({ type: "boundary", description: "API responses simulated; real suffix UI and validation." });
});

test.afterEach(({ page }) => { expect(runtimeErrors.get(page)).toEqual([]); });

async function login(page: Page) {
  await page.goto("/account");
  await page.locator("#email").fill(profile.email);
  await page.locator("#password").fill("Original123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit details", exact: true })).toBeVisible();
}

test("grouped suffix menu exposes every supported choice and fits desktop and narrow screens", async ({ page }) => {
  await page.goto("/register");
  if (process.env.SUFFIX_BASELINE) await page.screenshot({ path: "tests/evidence/suffix-menu/before-desktop.png" });
  for (const width of [1280, 320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 800 });
    await page.getByRole("button", { name: "Show suffix options" }).click({ timeout: 3000 });
    const menu = page.getByRole("group", { name: "Suffix suggestions", exact: true });
    await expect(menu).toBeVisible();
    for (const label of ["Jr.", "Sr.", "II", "III", "IV", "V", "No suffix"]) {
      await expect(menu.getByRole("button", { name: label, exact: true })).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const bounds = await menu.boundingBox();
    expect(bounds).not.toBeNull();
    if (bounds) {
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(800);
    }
    if (width === 1280 || width === 375) await page.screenshot({ path: `tests/evidence/suffix-menu/after-${width}.png` });
    await menu.getByRole("button", { name: "Jr.", exact: true }).click();
    await expect(page.locator("#suffix")).toHaveValue("Jr.");
    await expect(page.locator("#suffix")).toBeFocused();
    await expect(menu).toHaveCount(0);
  }
});

test("suffix typing, keyboard selection, clearing, dismissal and validation stay usable", async ({ page }) => {
  await page.goto("/register");
  const suffix = page.locator("#suffix");
  const menu = page.getByRole("group", { name: "Suffix suggestions", exact: true });
  await suffix.fill("sr");
  await expect(menu.getByRole("button", { name: "Sr.", exact: true })).toBeVisible();
  await expect(menu.getByRole("button", { name: "Jr.", exact: true })).toHaveCount(0);
  await suffix.press("Enter");
  await expect(suffix).toHaveValue("Sr.");
  await expect(menu).toHaveCount(0);
  await suffix.press("ArrowDown");
  await expect(menu.getByRole("button", { name: "Jr.", exact: true })).toBeFocused();
  await page.keyboard.press("End");
  await expect(menu.getByRole("button", { name: "No suffix", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(suffix).toHaveValue("");
  await expect(suffix).toBeFocused();
  await suffix.fill("iii");
  await suffix.press("ArrowLeft");
  await expect(suffix).toHaveJSProperty("selectionStart", 2);
  await suffix.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(suffix).toHaveValue("iii");
  await page.getByRole("button", { name: "Show suffix options" }).click();
  await page.locator("#first-name").click();
  await expect(menu).toHaveCount(0);
  await suffix.fill("Esq.");
  await suffix.press("Tab");
  await page.getByRole("button", { name: "Hide suffix options" }).press("Tab");
  await page.getByRole("button", { name: "No suffix", exact: true }).press("Tab");
  await expect(menu).toHaveCount(0);
  await expect(suffix).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Use Jr., Sr., II, III, IV, or V, or leave it blank.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account", exact: true })).toBeDisabled();
});

test("account edit saves the grouped suffix through the existing account contract", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Edit details" }).click();
  await page.getByRole("button", { name: "Show suffix options" }).click();
  await page.getByRole("button", { name: "IV", exact: true }).click();
  let saved: unknown;
  await page.route("**/api/auth/me", async (route) => {
    if (route.request().method() !== "PATCH") return route.fulfill({ json: { user: profile } });
    saved = route.request().postDataJSON();
    await route.fulfill({ json: { user: { ...profile, suffix: "IV", name: "Ana Reyes IV", residency_status: "pending" } } });
  });
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await expect.poll(() => saved).toMatchObject({ suffix: "IV", address_line: profile.address_line });
  await expect(page.getByRole("button", { name: "Edit details", exact: true })).toBeVisible();
});

test("admin account creation selects and submits a grouped suffix", async ({ page }) => {
  await login(page);
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { user: { ...profile, role: "admin" } } }));
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "New account", exact: true }).click();
  await page.getByRole("button", { name: "Show suffix options" }).click();
  await page.getByRole("button", { name: "III", exact: true }).click();
  await expect(page.locator("#new-suffix")).toHaveValue("III");
  await page.locator("#new-first-name").fill("Ana");
  await page.locator("#new-last-name").fill("Reyes");
  await page.locator("#new-email").fill("staff@kamoti.invalid");
  await page.locator("#new-password").fill("Original123!");
  let created: unknown;
  await page.route("**/api/admin/users", async (route) => {
    if (route.request().method() !== "POST") return route.fulfill({ json: { users: [] } });
    created = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { user: profile } });
  });
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect.poll(() => created).toMatchObject({ suffix: "III" });
});
