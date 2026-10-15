// Opens the built site under its CSP with /api mocked, and lists every violation.
import { createRequire } from "node:module";
const require = createRequire(process.argv[2] + "/package.json");
const { chromium } = require("@playwright/test");
const out = process.argv[3];
const base = process.argv[4] ?? "http://localhost:5173";
const fs = require("node:fs");
const vercel = JSON.parse(fs.readFileSync(process.argv[2] + "/vercel.json", "utf8"));
const csp = vercel.headers[0].headers.find((h) => h.key === "Content-Security-Policy").value;

const now = Date.now() / 1000;
const citizen = { id: "c0000000-0000-4000-8000-000000000001", name: "Ana Reyes", first_name: "Ana", last_name: "Reyes", email: "ana@example.com",
  role: "citizen", is_active: true, residency_status: "verified", has_residency_proof: true, barangay: "Poblacion", address_line: "1 Test St",
  contact_number: "09171234567", phone_verified_at: null, residency_review_version: "c0000000-0000-4000-8000-000000000002" };
const report = { id: "r0000000-0000-4000-8000-000000000001", reference_code: "KMT-2026-000042", title: "Pothole on Rizal Street",
  description: "Deep pothole near the corner, cars swerve around it.", category: "Road", category_id: 1, latitude: 14.5547, longitude: 121.0244,
  address_text: "Rizal Street, Poblacion, Makati", barangay: "Poblacion", status: "in_progress", submitted_at: "2026-10-01T02:15:11.402Z",
  updated_at: "2026-10-02T02:15:11.402Z", status_changed_at: "2026-10-02T02:15:11.402Z", resolved_at: null, rejection_reason: null,
  citizen: { id: citizen.id, name: citizen.name }, assigned_staff: null, photos: [{ kind: "initial", storage_path: "x/initial.jpg",
  url: "https://placeholder.supabase.co/storage/v1/object/public/report-photos/x/initial.jpg", purged_at: null }] };
const api = {
  "/api/auth/me": { user: citizen },
  "/api/categories": { categories: [{ id: 1, name: "Road", description: null, is_active: true }] },
  "/api/reports/meta/problem-types": { groups: [{ category_id: 1, types: [{ id: 1, name: "Pothole", category_id: 1 }] }] },
  "/api/public/stats": { total: 1, by_status: { under_review: 0, in_progress: 1, resolved: 0, rejected: 0 } },
  "/api/public/reports": { reports: [report], page: 1, per_page: 50, total: 1 },
  "/api/reports": { reports: [report], page: 1, per_page: 20, total: 1 },
  "/api/exports/reports": { reports: [report], total: 1, capped: false, limit: 5000 },
  "/api/notifications": { notifications: [], page: 1, per_page: 20, total: 0, unread: 0 },
};

const browser = await chromium.launch();
const context = await browser.newContext({ acceptDownloads: true, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36" });
const violations = [];
const errors = [];
const page = await context.newPage();
await page.addInitScript(([token, exp]) => {
  localStorage.setItem("kamoti.token", token);
  localStorage.setItem("kamoti.expires", String(exp));
  localStorage.setItem("kamoti.activity", String(Date.now()));
  document.addEventListener("securitypolicyviolation", (e) =>
    console.log(`CSP-VIOLATION ${e.violatedDirective} ${e.blockedURI} ${e.sourceFile ?? ""}`));
}, ["mock-token", Math.floor(now + 3600)]);
page.on("console", (m) => {
  const t = m.text();
  if (t.startsWith("CSP-VIOLATION") || t.includes("Content Security Policy")) violations.push(`[${page.url()}] ${t}`);
  else if (m.type() === "error") errors.push(`[${page.url()}] ${t}`);
});
const requests = new Set();
page.on("request", (r) => { const u = new URL(r.url()); if (u.hostname !== "localhost") requests.add(u.hostname); });
page.on("requestfailed", (r) => errors.push(`[failed] ${r.url().slice(0, 140)} ${r.failure()?.errorText}`));
page.on("response", (r) => { if (r.status() >= 400) errors.push(`[${r.status()}] ${r.url().slice(0, 140)}`); });
if (!base.includes("localhost")) {
  // Another origin: serve its own pages, with this repository's CSP added.
  await page.route(`${base}/**`, async (route) => {
    if (new URL(route.request().url()).pathname.startsWith("/api/")) return route.fallback();
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": csp } });
  });
}
await page.route((url) => url.origin === new URL(base).origin && url.pathname.startsWith("/api/"), (route) => {
  const path = new URL(route.request().url()).pathname;
  const body = api[path];
  return body ? route.fulfill({ json: body }) : route.fulfill({ status: 404, json: { error: `not mocked: ${path}` } });
});

async function visit(path, name, act) {
  await page.goto(`${base}${path}`);
  await page.waitForTimeout(5000);
  if (act) await act();
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}

await visit("/board", "board");
await visit("/report/new", "report-new", async () => {
  // Place search (Places) and a pin (Nominatim) if the controls are there.
  const search = page.getByPlaceholder(/street, building, or landmark/i).first();
  if (await search.count()) {
    await search.click();
    await search.pressSequentially("Ayala Triangle", { delay: 80 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${out}/places.png` });
    await page.keyboard.press("Escape");
    await page.goto(`${base}/report/new`);
    await page.waitForTimeout(4000);
  } else console.log("No place search found");
  const center = page.getByRole("button", { name: /place pin at map center/i });
  if (await center.count()) { await center.click(); await page.waitForTimeout(3000); }
});
await visit("/my-reports", "my-reports", async () => {
  const exportButton = page.getByRole("button", { name: /^export$/i });
  if (await exportButton.count()) {
    await exportButton.click();
    const download = page.waitForEvent("download", { timeout: 15000 }).catch(() => null);
    await page.getByRole("menuitem", { name: /pdf/i }).or(page.getByText("Download PDF")).first().click();
    const file = await download;
    console.log("PDF download:", file ? file.suggestedFilename() : "none");
  } else console.log("No export button found");
});
await visit("/account", "account");

console.log("External hosts:", [...requests].sort().join(", "));
console.log("CSP violations:", violations.length ? "\n  " + [...new Set(violations)].join("\n  ") : "none");
console.log("Other console errors:", errors.length ? "\n  " + [...new Set(errors)].slice(0, 15).join("\n  ") : "none");
await browser.close();
