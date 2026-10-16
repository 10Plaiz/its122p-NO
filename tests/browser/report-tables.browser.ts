import { expect, test } from "@playwright/test";
import type { Report, Role } from "../../src/web/lib/types.js";

const scenarios: { role: Role; path: string; title: string; status: string; sort: string }[] = [
  { role: "citizen", path: "/my-reports", title: "My reports", status: "pending", sort: "newest" },
  { role: "staff", path: "/staff/queue", title: "My queue", status: "under_review", sort: "oldest" },
  { role: "admin", path: "/admin/reports", title: "All reports", status: "pending", sort: "newest" },
];

for (const scenario of scenarios) {
  test(`${scenario.role}: refresh, sorting, retry and narrow toolbar (simulated API)`, async ({ page }) => {
    let revision = 0;
    let failList = false;
    let failCounts = false;
    let empty = false;
    let paginated = false;
    let delayed = false;
    let release = () => {};
    const requests: URL[] = [];
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const rows: Report[] = [1, 2, 3].map((id) => ({
      id: String(id), reference_code: `KMT-2026-00000${id}`, title: `Road ${id}`, description: "Road repair",
      status: scenario.role === "staff" ? "under_review" : "pending", latitude: 14.55, longitude: 121.02,
      address_text: "Poblacion", is_public: true, submitted_at: `2026-10-0${id}T12:00:00Z`,
      updated_at: "2026-10-03T12:00:00Z", resolved_at: null, barangay: "Poblacion", assigned_at: null,
      status_changed_at: "2026-10-01T12:00:00Z", closure_requested_at: null, closure_outcome: null,
      closure_reason: null, verified_at: null, category: { id: 1, name: "Roads" },
      primary_problem: null, secondary_problem: null, citizen: null, assigned_staff: null, photos: [],
    }));
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      const reply = (json: unknown, status = 200) => route.fulfill({ json, status });
      if (url.pathname === "/api/auth/login" || url.pathname === "/api/auth/me") return reply({
        user: { id: "simulated-user", name: "Table tester", email: "tables@kamoti.invalid", role: scenario.role,
          is_active: true, residency_status: "verified", residency_review_version: "v1", residency_proof_id: null },
        access_token: "simulated-token", expires_at: Math.floor(Date.now() / 1000) + 3600,
      });
      if (url.pathname === "/api/reports" || url.pathname === "/api/exports/reports") {
        requests.push(url);
        const count = url.searchParams.get("per_page") === "50";
        if (delayed && !count) await new Promise<void>((resolve) => { release = resolve; });
        if ((count && failCounts) || (!count && failList)) return reply({ error: "Simulated list failure. Try again." }, 503);
        const reports = empty ? [] : paginated ? Array.from({ length: 25 }, (_, index) => ({
          ...rows[index % rows.length], id: String(index + 1), title: `Road ${index + 1}`,
        })) : rows.slice(0, revision ? 3 : 2);
        if (url.searchParams.get("sort") !== "oldest") reports.reverse();
        const perPage = Number(url.searchParams.get("per_page") ?? 20);
        const currentPage = Number(url.searchParams.get("page") ?? 1);
        const visible = url.pathname === "/api/exports/reports" ? reports : reports.slice((currentPage - 1) * perPage, currentPage * perPage);
        return reply({ reports: visible, total: reports.length, page: currentPage, per_page: perPage, limit: 1000, capped: false });
      }
      if (url.pathname === "/api/categories") return reply({ categories: [{ id: 1, name: "Roads", is_active: true }] });
      if (url.pathname === "/api/feedback/summary/staff") return reply({ summary: { average: null, count: 0 } });
      if (url.pathname === "/api/notifications") return reply({ notifications: [], total: 0, page: 1, per_page: 20 });
      if (url.pathname === "/api/notifications/unread") return reply({ unread: 0 });
      if (url.pathname === "/api/staff") return reply({ staff: [] });
      throw new Error(`Unexpected simulated request: ${url.pathname}`);
    });
    await page.goto("/signin");
    await page.getByLabel(/^Email/).fill("tables@kamoti.invalid");
    await page.getByLabel(/^Password/).fill("Password123!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.goto(scenario.path);
    await expect(page.getByRole("heading", { name: scenario.title, exact: true })).toBeVisible();
    await expect(page.getByLabel("Status", { exact: true })).toHaveValue(scenario.status);
    await expect(page.getByRole("option", { name: /Any status \(2\)/ })).toHaveCount(1);
    if (process.env.TABLE_BASELINE === "1") {
      if (scenario.role === "admin") await page.screenshot({ path: "tests/evidence/website-tables/before-admin.png", fullPage: true });
      expect(await page.getByRole("button", { name: "Refresh", exact: true }).count()).toBe(0);
      expect(await page.getByLabel("Sort", { exact: true }).count()).toBe(scenario.role === "admin" ? 1 : 0);
      return;
    }
    const sort = page.getByLabel("Sort", { exact: true });
    const refresh = page.getByRole("button", { name: "Refresh", exact: true });
    await expect(sort).toHaveValue(scenario.sort);
    const titles = page.getByRole("table").getByRole("link", { name: /^Road/ });
    await expect(titles).toHaveText(scenario.sort === "oldest" ? ["Road 1", "Road 2"] : ["Road 2", "Road 1"]);
    await sort.selectOption(scenario.sort === "newest" ? "oldest" : "newest");
    const selectedSort = await sort.inputValue();
    await expect(titles).toHaveText(selectedSort === "oldest" ? ["Road 1", "Road 2"] : ["Road 2", "Road 1"]);
    await expect.poll(() => requests.filter((url) => url.searchParams.get("per_page") === "20").at(-1)?.searchParams.get("sort")).toBe(selectedSort);
    await page.getByLabel("Search", { exact: true }).fill("Road");
    await expect(refresh).toBeEnabled();
    await expect(page.getByRole("status").filter({ hasText: "Filter result counts are ready." })).toBeAttached();
    revision = 1;
    const before = requests.length;
    await refresh.click();
    await expect(page.getByRole("option", { name: /Any status \(3\)/ })).toHaveCount(1);
    expect(requests.slice(before).some((url) => url.searchParams.get("per_page") === "50")).toBe(true);
    expect(requests.slice(before).some((url) => url.searchParams.get("per_page") === "20" && url.searchParams.get("sort") === selectedSort)).toBe(true);
    await expect(sort).toHaveValue(selectedSort);
    await expect(page.getByLabel("Search", { exact: true })).toHaveValue("Road");
    await expect(page.getByLabel("Status", { exact: true })).toHaveValue(scenario.status);
    // Hold the visible-list response while counts finish, to inspect the loading surface.
    delayed = true;
    await refresh.click();
    await expect(page.getByRole("button", { name: "Refreshing…" })).toBeDisabled();
    await expect(page.getByRole("link", { name: "Road 1", exact: true })).toHaveCount(0);
    delayed = false;
    release();
    await expect(refresh).toBeEnabled();
    failList = true;
    await refresh.click();
    await expect(page.getByRole("alert")).toContainText("Simulated list failure");
    await expect(page.getByRole("link", { name: "Road 1", exact: true })).toHaveCount(0);
    failList = false;
    await refresh.click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    failCounts = true;
    await refresh.click();
    await expect(page.getByRole("button", { name: "Retry counts" })).toBeVisible();
    failCounts = false;
    await page.getByRole("button", { name: "Retry counts" }).click();
    await expect(page.getByRole("option", { name: /Any status \(3\)/ })).toHaveCount(1);
    if (scenario.role === "admin") {
      await sort.selectOption("status");
      await expect(refresh).toBeEnabled();
      await page.getByRole("button", { name: "Assign", exact: true }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
    }
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download CSV/ }).click();
    await download;
    expect(requests.at(-1)?.pathname).toBe("/api/exports/reports");
    expect(requests.at(-1)?.searchParams.get("sort")).toBe(await sort.inputValue());
    await expect(page).toHaveURL(new RegExp(`${scenario.path}$`));
    for (const width of [320, 375, 414, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const group = page.getByRole("group", { name: `${scenario.title} search and filters` });
      expect(await group.locator("input, select, button").last().getAttribute("id")).toBe("q");
      if (width === 320) await page.screenshot({ path: `tests/evidence/website-tables/after-${scenario.role}-320.png`, fullPage: true });
    }
    paginated = true;
    await refresh.click();
    await expect(refresh).toBeEnabled();
    await page.getByRole("button", { name: "Page 2", exact: true }).click();
    await expect(refresh).toBeEnabled();
    await refresh.click();
    await expect(refresh).toBeEnabled();
    expect(requests.filter((url) => url.searchParams.get("per_page") === "20").at(-1)?.searchParams.get("page")).toBe("2");
    await sort.selectOption((await sort.inputValue()) === "oldest" ? "newest" : "oldest");
    await expect(refresh).toBeEnabled();
    expect(requests.filter((url) => url.searchParams.get("per_page") === "20").at(-1)?.searchParams.get("page")).toBe("1");
    empty = true;
    await refresh.click();
    await expect(page.getByText("Nothing matches those filters", { exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: "Any status (0)", exact: true })).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}

