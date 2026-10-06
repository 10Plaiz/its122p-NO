import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { signIn } from "./helpers.js";
import type { Profile } from "../../src/web/lib/types.js";

const evidence = "tests/evidence/filters-2026-10-05";
const adminEmail = process.env.UI_AUDIT_ADMIN_EMAIL ?? "fixture-admin@kamoti.invalid";
const pageErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("https://maps.googleapis.com/**", (route) => route.abort());
});

test.afterEach(() => expect(pageErrors).toEqual([]));

async function optionCount(select: Locator, value: string) {
  return select.evaluate((element, selected) => {
    if (!(element instanceof HTMLSelectElement)) throw new Error("Expected a filter select.");
    const text = Array.from(element.options).find((option) => option.value === selected)?.text ?? "";
    const number = text.match(/\(([\d,]+)\)$/)?.[1];
    return number === undefined ? null : Number(number.replaceAll(",", ""));
  }, value);
}

async function expectCount(page: Page, selector: string, value: string, count: number) {
  await expect.poll(() => optionCount(page.locator(selector), value)).toBe(count);
}

async function apiTotal(page: Page, path: string, filters: Record<string, string> = {}) {
  return page.evaluate(async ({ path, filters }) => {
    const query = new URLSearchParams({ per_page: "1" });
    for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
    const token = localStorage.getItem("kamoti.token");
    const response = await fetch(`/api${path}?${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok) throw new Error(`The comparison request failed (${response.status}).`);
    const data: { total: number } = await response.json();
    return data.total;
  }, { path, filters });
}

async function firstAvailable(select: Locator) {
  return select.evaluate((element) => {
    if (!(element instanceof HTMLSelectElement)) throw new Error("Expected a filter select.");
    return Array.from(element.options).find((option) => option.value !== "" && /\([1-9][\d,]*\)$/.test(option.text))?.value ?? "";
  });
}

async function mobileWidths(page: Page) {
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
}

test("Public filters count every page, combine selections, and preserve explicit Any status", async ({ page }) => {
  let countPages = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/public/reports" && url.searchParams.get("per_page") === "100") countPages++;
  });
  await page.goto("/board");
  await expect(page.locator("#status")).toHaveValue("under_review");
  const total = await apiTotal(page, "/public/reports");
  await expectCount(page, "#status", "", total);
  expect(countPages).toBe(Math.max(1, Math.ceil(total / 100)));
  await expectCount(page, "#status", "resolved", await apiTotal(page, "/public/reports", { status: "resolved" }));
  await page.screenshot({ path: `${evidence}/board-default-desktop.png`, fullPage: false });

  const category = await firstAvailable(page.locator("#category"));
  expect(category).not.toBe("");
  await page.locator("#category").selectOption(category);
  await expectCount(page, "#status", "", await apiTotal(page, "/public/reports", { category_id: category }));
  await page.locator("#status").selectOption("resolved");
  await expectCount(page, "#category", "", await apiTotal(page, "/public/reports", { status: "resolved" }));
  await expectCount(page, "#barangay", "", await apiTotal(page, "/public/reports", { status: "resolved", category_id: category }));
  expect(countPages).toBe(Math.max(1, Math.ceil(total / 100)));

  await mobileWidths(page);
  await page.screenshot({ path: `${evidence}/board-counts-mobile.png`, fullPage: true });
  await page.locator("#status").selectOption("");
  await expect(page).toHaveURL(/status=all/);
  await page.reload();
  await expect(page.locator("#status")).toHaveValue("");
  await page.getByRole("searchbox").fill("ui-no-matching-report-93821");
  await expect(page.getByRole("heading", { name: "Nothing matches this view" })).toBeVisible();
  await expectCount(page, "#status", "", 0);
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.locator("#status")).toHaveValue("");
  await expect(page.locator("#category")).toHaveValue("");
  await expectCount(page, "#status", "", total);
});

test("Admin Reports starts Pending and its counts match category and barangay queries", async ({ page }) => {
  await signIn(page, adminEmail);
  await page.goto("/admin/reports");
  await expect(page.locator("#status")).toHaveValue("pending");
  const total = await apiTotal(page, "/reports");
  await expectCount(page, "#status", "", total);
  await expectCount(page, "#status", "pending", await apiTotal(page, "/reports", { status: "pending" }));
  await expectCount(page, "#category", "", await apiTotal(page, "/reports", { status: "pending" }));
  await page.screenshot({ path: `${evidence}/admin-reports-default-desktop.png`, fullPage: false });
  const category = await firstAvailable(page.locator("#category"));
  expect(category).not.toBe("");
  await page.locator("#category").selectOption(category);
  await expectCount(page, "#status", "resolved", await apiTotal(page, "/reports", { status: "resolved", category_id: category }));
  const barangay = await firstAvailable(page.locator("#barangay"));
  expect(barangay).not.toBe("");
  await page.locator("#barangay").selectOption(barangay);
  await expectCount(page, "#status", "", await apiTotal(page, "/reports", { category_id: category, barangay }));
  await mobileWidths(page);
  await page.screenshot({ path: `${evidence}/admin-reports-counts-mobile.png`, fullPage: true });
  await page.getByRole("searchbox").fill("ui-no-matching-report-93821");
  await expect(page.getByRole("heading", { name: "Nothing matches those filters" })).toBeVisible();
  await expectCount(page, "#status", "pending", 0);
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.locator("#status")).toHaveValue("");
  await expect(page.locator("#category")).toHaveValue("");
  await expect(page.locator("#barangay")).toHaveValue("");
  await expectCount(page, "#status", "", total);
});

test("Account filters count proof waiting for review, role changes, status, and search", async ({ page }) => {
  await signIn(page, adminEmail);
  const base = { is_active: true, contact_number: null, created_at: "2026-10-05T00:00:00Z", residency_review_version: "d0261005-0000-4000-8000-000000000001", residency_proof_id: null };
  const users: Profile[] = [
    { ...base, id: "pending-proof", name: "Counted citizen one", email: "count-one@kamoti.invalid", role: "citizen", residency_status: "pending", residency_proof_id: "d0261005-0000-4000-8000-000000000002", has_residency_proof: true },
    { ...base, id: "missing-proof", name: "Counted citizen two", email: "count-two@kamoti.invalid", role: "citizen", residency_status: "pending", has_residency_proof: false },
    { ...base, id: "verified", name: "Verified citizen", email: "verified-count@kamoti.invalid", role: "citizen", residency_status: "verified", is_active: false },
    { ...base, id: "staff", name: "Counted staff", email: "count-staff@kamoti.invalid", role: "staff" },
  ];
  let reads = 0;
  await page.route(/\/api\/admin\/users(?:\?|$)/, async (route) => {
    expect(route.request().method()).toBe("GET");
    reads++;
    await route.fulfill({ json: { users } });
  });
  await page.goto("/admin/users");
  await expectCount(page, "#role-filter", "", 4);
  await expectCount(page, "#role-filter", "citizen", 3);
  await expectCount(page, "#residency-filter", "pending", 1);
  await expectCount(page, "#user-status-filter", "deactivated", 1);
  const initialReads = reads;
  await page.locator("#residency-filter").selectOption("pending");
  await expect(page.getByRole("row", { name: /Counted citizen one/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Counted citizen two/ })).toHaveCount(0);
  await expectCount(page, "#role-filter", "staff", 1);
  await page.locator("#role-filter").selectOption("staff");
  await expect(page.locator("#residency-filter")).toHaveValue("");
  await expect(page.locator("#residency-filter")).toBeDisabled();
  await expect(page.getByRole("row", { name: /Counted staff/ })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await page.getByRole("searchbox").fill("COUNT-");
  await expectCount(page, "#role-filter", "", 3);
  await expectCount(page, "#role-filter", "citizen", 2);
  await page.locator("#user-status-filter").selectOption("deactivated");
  await expect(page.getByRole("heading", { name: "No accounts match your filters" })).toBeVisible();
  await expectCount(page, "#role-filter", "", 0);
  expect(reads).toBe(initialReads);
  await mobileWidths(page);
  await page.screenshot({ path: `${evidence}/users-filter-counts-simulated-mobile.png`, fullPage: true });
});

test("Activity filter counts include every page and respect reference and date restrictions", async ({ page }) => {
  await signIn(page, adminEmail);
  await page.goto("/admin/logs");
  await expectCount(page, "#log-action", "", await apiTotal(page, "/admin/logs"));
  const action = await firstAvailable(page.locator("#log-action"));
  expect(action).not.toBe("");
  await page.locator("#log-action").selectOption(action);
  await expectCount(page, "#log-role", "", await apiTotal(page, "/admin/logs", { action }));
  await expectCount(page, "#log-role", "admin", await apiTotal(page, "/admin/logs", { action, role: "admin" }));
  await page.locator("#log-role").selectOption("admin");
  await expectCount(page, "#log-action", "", await apiTotal(page, "/admin/logs", { role: "admin" }));
  await page.locator("#log-reference").fill("KMT-2026");
  await expectCount(page, "#log-action", "", await apiTotal(page, "/admin/logs", { role: "admin", reference: "KMT-2026" }));
  await page.locator("#log-from").fill("2040-01-01");
  await expectCount(page, "#log-action", "", 0);
  await expectCount(page, "#log-role", "admin", 0);
  await expect(page.getByRole("heading", { name: "No entries match those filters" })).toBeVisible();
  await mobileWidths(page);
  await page.screenshot({ path: `${evidence}/log-filter-counts-mobile.png`, fullPage: true });
});

test("Incomplete or changing count pages never appear as zero, and retry keeps the board usable", async ({ page }) => {
  let mode: "failure" | "changed" | "duplicate" | "complete" = "failure";
  await page.route("**/api/public/reports?**", async (route) => {
    const query = new URL(route.request().url()).searchParams;
    if (query.get("per_page") !== "100") return route.continue();
    const pageNumber = Number(query.get("page"));
    if (pageNumber === 2 && mode === "failure") return route.fulfill({ status: 503, json: { error: "Simulated counting failure." } });
    // Controlled count-only pages guarantee a later-page failure independently
    // of the seed size. The actual visible board request remains live.
    const items = Array.from({ length: pageNumber === 1 ? 100 : 20 }, (_, index) => ({
      id: `count-only-${pageNumber === 2 && mode === "duplicate" && index === 0 ? 0 : (pageNumber - 1) * 100 + index}`,
      status: "under_review",
      category_id: 1,
      barangay: "Bel-Air",
    }));
    await route.fulfill({ json: { reports: items, page: pageNumber, per_page: 100, total: pageNumber === 2 && mode === "changed" ? 121 : 120 } });
  });
  await page.goto("/board");
  await expect(page.getByRole("button", { name: "Retry counts", exact: true })).toBeVisible();
  await expect(page.locator("main .status-pill").first()).toBeVisible();
  expect(await optionCount(page.locator("#status"), "resolved")).toBeNull();
  await page.screenshot({ path: `${evidence}/count-failure-board.png`, fullPage: false });
  mode = "changed";
  await page.getByRole("button", { name: "Retry counts", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry counts", exact: true })).toBeVisible();
  expect(await optionCount(page.locator("#status"), "")).toBeNull();
  mode = "duplicate";
  await page.getByRole("button", { name: "Retry counts", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry counts", exact: true })).toBeVisible();
  expect(await optionCount(page.locator("#status"), "")).toBeNull();
  mode = "complete";
  await page.getByRole("button", { name: "Retry counts", exact: true }).click();
  await expectCount(page, "#status", "", 120);
  await expectCount(page, "#status", "resolved", 0);
  await expect(page.getByRole("button", { name: "Retry counts", exact: true })).toHaveCount(0);
});

test("A new search cancels obsolete count requests and ignores late responses", async ({ page }) => {
  let release = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  let aborted = false;
  page.on("requestfailed", (request) => {
    const query = new URL(request.url()).searchParams;
    if (query.get("q") === "obsolete-filter-search" && query.get("per_page") === "100") aborted = true;
  });
  await page.route("**/api/public/reports?**", async (route) => {
    const query = new URL(route.request().url()).searchParams;
    if (query.get("per_page") !== "100" || query.get("q") !== "obsolete-filter-search") return route.continue();
    await held;
    await route.fulfill({ json: {
      reports: [{ id: "late-count-only", status: "resolved", category_id: 1, barangay: "Bel-Air" }],
      total: 1, page: 1, per_page: 100,
    } });
  });
  try {
    await page.goto("/board");
    const started = page.waitForRequest((request) => {
      const query = new URL(request.url()).searchParams;
      return query.get("q") === "obsolete-filter-search" && query.get("per_page") === "100";
    });
    await page.getByRole("searchbox").fill("obsolete-filter-search");
    await started;
    await page.getByRole("searchbox").fill("ui-no-matching-report-93821");
    await expectCount(page, "#status", "", 0);
    await expect.poll(() => aborted).toBe(true);
    release();
    await page.waitForLoadState("networkidle");
    await expectCount(page, "#status", "", 0);
    await expectCount(page, "#status", "resolved", 0);
  } finally {
    release();
  }
});

test("Staff queue uses Under review initially and its scoped filter counts match the API", async ({ page }) => {
  await signIn(page, "demo-makati-staff-2@kamoti.invalid");
  await page.goto("/staff/queue");
  await expect(page.locator("#status")).toHaveValue("under_review");
  await expectCount(page, "#status", "", await apiTotal(page, "/reports"));
  await expectCount(page, "#status", "pending", await apiTotal(page, "/reports", { status: "pending" }));
  await expectCount(page, "#barangay", "", await apiTotal(page, "/reports", { status: "under_review" }));
  await mobileWidths(page);
  await page.screenshot({ path: `${evidence}/staff-counts-mobile.png`, fullPage: true });
});
