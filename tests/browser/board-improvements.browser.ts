import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { PublicReport } from "../../src/web/lib/types.js";

const evidence = "tests/evidence/website-board";
const reports: PublicReport[] = Array.from({ length: 55 }, (_, i) => ({
  id: `board-${i}`, reference_code: `KAM-2026-${i + 1}`, title: `Illustrative road repair ${i + 1}`,
  description: "Simulated public report for focused board verification.", category: "Road", category_id: 1,
  latitude: 14.5547 + i * .0001, longitude: 121.0244, address_text: "Sample street, Makati",
  status: i % 3 === 0 ? "under_review" : i % 3 === 1 ? "in_progress" : "resolved",
  submitted_at: new Date(Date.UTC(2026, 9, 12 - i)).toISOString(), resolved_at: null,
  barangay: "Bel-Air", photos: [{ kind: "initial", storage_path: `sample-${i}`, url: "/sample-photo.svg" }], rejection_reason: null,
}));

async function fixtures(page: Page) {
  const calls: string[] = [];
  const control = { fail: false, empty: false, revision: false };
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    calls.push(url.pathname + url.search);
    if (control.fail) return route.fulfill({ status: 503, json: { error: "Simulated unavailable API" } });
    if (url.pathname === "/api/public/stats") return route.fulfill({ json: { total: control.revision ? 56 : 55, by_status: { under_review: 19, in_progress: 18, resolved: 18, rejected: 0 } } });
    if (url.pathname === "/api/categories") return route.fulfill({ json: { categories: [{ id: 1, name: "Road", is_active: true }] } });
    if (url.pathname !== "/api/public/reports") return route.fulfill({ status: 404, json: {} });
    let rows = control.empty ? [] : reports.filter((r) => (!url.searchParams.get("status") || r.status === url.searchParams.get("status")) && (!url.searchParams.get("q") || r.title.includes(url.searchParams.get("q")!)));
    if (url.searchParams.get("sort") === "oldest") rows = [...rows].reverse();
    if (control.revision) rows = rows.map((r) => ({ ...r, title: `${r.title} refreshed` }));
    const pageNumber = Number(url.searchParams.get("page") || 1), perPage = Number(url.searchParams.get("per_page") || 50);
    await route.fulfill({ json: { reports: rows.slice((pageNumber - 1) * perPage, pageNumber * perPage), total: rows.length, page: pageNumber, per_page: perPage } });
  });
  await page.route("**/sample-photo.svg", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#e9efef"/><text x="100" y="400" font-size="50">Simulated road photo</text></svg>' }));
  return { calls, control };
}

// Only the external map adapter is simulated. ReportMap's real marker callbacks,
// Board selection, cards, panels and focus logic run unchanged.
async function simulatedMaps(page: Page) {
  const source = await (await page.request.get("/components/ReportMap.tsx")).text();
  const reactUrl = source.match(/from "([^"]*\/react\.js[^"]*)"/)?.[1];
  if (!reactUrl) throw new Error("Could not locate Vite's React module for the simulated Maps adapter.");
  await page.route("**/components/MapFrame.tsx*", (route) => route.fulfill({ contentType: "text/javascript", body: `export function MapFrame({children}) { return children; } export function MakatiOutline() { return null; }` }));
  await page.route("**/@vis__gl_react-google-maps.js*", (route) => route.fulfill({ contentType: "text/javascript", body: `import React from ${JSON.stringify(reactUrl)};
    export function Map({children}) { return React.createElement('div', {style:{height:'100%',padding:16},'aria-label':'Simulated map'}, 'Simulated Maps adapter', children); }
    export function AdvancedMarker({children,title,onClick}) { return React.createElement('button',{onClick,title,'aria-label':'Map report: '+title,style:{margin:4,padding:8}},children); }
    export function useMap() { return null; }
    export function useMapsLibrary() { return null; }` }));
}

test("board sort, filters, refresh, count updates, error and empty recovery", async ({ page }) => {
  const { calls, control } = await fixtures(page);
  await page.goto("/board");
  await expect(page.locator("#status")).toHaveValue("under_review");
  await expect(page.getByRole("button", { name: "Refresh board", exact: true })).toBeEnabled();
  await page.locator("#status").selectOption("");
  await page.locator("#sort").selectOption("oldest");
  await expect(page.locator("article h3").first()).toHaveText("Illustrative road repair 55");
  await page.locator("#category").selectOption("1");
  await page.locator("#barangay").selectOption("Bel-Air");
  const before = calls.length;
  const url = page.url();
  control.revision = true;
  await page.getByRole("button", { name: "Refresh board", exact: true }).click();
  await expect(page.locator("article h3").first()).toHaveText("Illustrative road repair 55 refreshed");
  await expect(page.getByRole("button", { name: "Refresh board", exact: true })).toBeEnabled();
  expect(page.url()).toBe(url);
  await expect(page.getByText("56", { exact: true })).toBeVisible();
  expect(calls.slice(before).some((c) => c.startsWith("/api/public/stats"))).toBe(true);
  expect(calls.slice(before).some((c) => c.includes("per_page=100"))).toBe(true);
  await expect(page.locator("#status option").first()).toHaveText("Any status (55)");
  control.fail = true;
  await page.getByRole("button", { name: "Refresh board", exact: true }).click();
  await expect(page.getByText("Could not load the board", { exact: true })).toBeVisible();
  control.fail = false; control.empty = true;
  await page.getByRole("button", { name: "Refresh board", exact: true }).click();
  await expect(page.getByText("Nothing matches this view")).toBeVisible();
  control.empty = false;
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(50);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(5);
  await expect(page).toHaveURL(/page=2/);
});

test("desktop marker reveals its card, photos support keyboard and missing images", async ({ page }) => {
  await fixtures(page); await simulatedMaps(page);
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/board?status=all");
  await expect(page.getByRole("region", { name: "Map and report legend" })).toBeVisible();
  expect(await page.getByTestId("board-list-container").evaluate((el) => el.scrollTop)).toBe(0);
  await page.getByRole("button", { name: "Map report: Illustrative road repair 20", exact: true }).click();
  const expand = page.getByRole("button", { name: "Collapse details for Illustrative road repair 20", exact: true });
  await expect(expand).toBeFocused();
  expect(await page.getByTestId("board-list-container").evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  const photo = page.getByRole("button", { name: "Enlarge photo of Illustrative road repair 20", exact: true });
  await photo.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Close photo view" })).toBeFocused();
  await page.screenshot({ path: `${evidence}/after-photo.png` });
  await page.keyboard.press("Escape"); await expect(photo).toBeFocused();
  await photo.click(); await page.locator(".dialog-backdrop").click({ position: { x: 2, y: 2 } });
  await expect(photo).toBeFocused();
  await page.route("**/sample-photo.svg", (route) => route.fulfill({ status: 404, body: "missing" }));
  await page.reload();
  await page.getByRole("button", { name: "Map report: Illustrative road repair 20", exact: true }).click();
  await expect(page.getByText("Photo unavailable. The report details are still available.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry photo" })).toBeEnabled();
  expect(errors).toEqual([]);
});

test("mobile marker opens a closable panel, keeps map context and restores focus", async ({ page }) => {
  await fixtures(page); await simulatedMaps(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/board?status=all&pane=map");
  const marker = page.getByRole("button", { name: "Map report: Illustrative road repair 3", exact: true });
  await marker.click();
  const panel = page.getByRole("dialog", { name: "Selected report: Illustrative road repair 3", exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: "Close report", exact: true })).toBeFocused();
  await expect(page.getByTestId("board-map-container")).toBeVisible();
  await panel.getByRole("button", { name: "Enlarge photo of Illustrative road repair 3" }).click();
  await page.keyboard.press("Escape");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: "Enlarge photo of Illustrative road repair 3" })).toBeFocused();
  await page.screenshot({ path: `${evidence}/after-mobile-panel.png` });
  await expect(panel.getByRole("button", { name: "Close report", exact: true })).toBeInViewport();
  const mapBox = await page.getByTestId("board-map-container").boundingBox();
  const panelBox = await panel.boundingBox();
  expect(mapBox && panelBox ? panelBox.y - Math.max(0, mapBox.y) : 0).toBeGreaterThan(200);
  await page.keyboard.press("Escape"); await expect(panel).toHaveCount(0); await expect(marker).toBeFocused();
  for (const width of [320, 375, 414, 768, 1280]) {
    await page.setViewportSize({ width, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("missing Maps key retains list, photos, larger map and filters", async ({ page }) => {
  await fixtures(page);
  await page.goto("/board?status=all");
  await expect(page.getByTestId("map-unavailable")).toBeVisible();
  expect(await page.getByTestId("board-map-container").evaluate((el) => el.getBoundingClientRect().height)).toBe(680);
  await expect(page.getByRole("button", { name: "Refresh board", exact: true })).toBeEnabled();
  await page.screenshot({ path: `${evidence}/after-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 320, height: 812 });
  await page.getByTestId("mobile-view-map").click();
  await expect(page.getByTestId("map-unavailable")).toBeVisible();
  await page.getByTestId("mobile-view-list").click();
  await expect(page.locator("article").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
