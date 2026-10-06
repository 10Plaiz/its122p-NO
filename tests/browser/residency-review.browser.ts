import { expect, test, type Page } from "@playwright/test";
import { z } from "zod";
import { jsPDF } from "jspdf";
import type { Profile } from "../../src/web/lib/types.js";
import { signIn } from "./helpers.js";

const VERSION_A = "11111111-1111-4111-8111-111111111111";
const VERSION_B = "22222222-2222-4222-8222-222222222222";
const VERSION_C = "33333333-3333-4333-8333-333333333333";
const PROOF_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROOF_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CITIZEN_ID = "44444444-4444-4444-8444-444444444444";
const citizen = {
  id: CITIZEN_ID,
  name: "Local Citizen",
  email: "local-citizen@kamoti.invalid",
  role: "citizen",
  is_active: true,
  barangay: "Poblacion",
  address_line: "10 Original Street",
  residency_status: "pending",
  has_residency_proof: true,
  residency_review_version: VERSION_A,
  residency_proof_id: PROOF_A,
  residency_note: null,
  residency_reviewed_at: null,
  reviewer: null,
} satisfies Profile;
const admin = {
  id: "55555555-5555-4555-8555-555555555555",
  name: "Local Administrator",
  email: "local-admin@kamoti.invalid",
  role: "admin",
  is_active: true,
  residency_review_version: VERSION_A,
  residency_proof_id: null,
} satisfies Profile;

const decisionSchema = z.object({
  decision: z.enum(["verified", "rejected"]),
  expected_version: z.uuid(),
  note: z.string().optional(),
});
type Decision = z.infer<typeof decisionSchema>;
type Simulation = {
  current: Profile;
  kind: "image" | "pdf";
  decisions: Decision[];
  proofVersions: string[];
  refreshFailures: number;
  uploadFailures: number;
  commitLostUpload: boolean;
  uploads: { id: string; version: string; filename: string }[];
};

function simulation(): Simulation {
  return {
    current: { ...citizen },
    kind: "image",
    decisions: [],
    proofVersions: [],
    refreshFailures: 0,
    uploadFailures: 0,
    commitLostUpload: false,
    uploads: [],
  };
}

const proofUrl = (id: string, kind: Simulation["kind"]) => `/simulated-proofs/${id}.${kind === "pdf" ? "pdf" : "png"}`;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=", "base64");
const PDF = Buffer.from(new jsPDF().text("Simulated immutable residency proof", 10, 10).output("arraybuffer"));

async function adaptApi(page: Page, state: Simulation, persona: "admin" | "citizen" = "admin") {
  await page.context().route("**/simulated-proofs/**", (route) => route.fulfill({
    status: 200,
    contentType: state.kind === "pdf" ? "application/pdf" : "image/png",
    body: state.kind === "pdf" ? PDF : PNG,
  }));
  await page.context().route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const reply = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    const conflict = () => reply({ error: "The review has changed. Refresh review before you decide." }, 409);
    if (path === "/api/auth/login") {
      return reply({
        user: persona === "admin" ? admin : state.current,
        access_token: "local-simulated-token",
        refresh_token: "local-simulated-refresh",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      });
    }
    if (path === "/api/auth/me") {
      if (persona === "citizen" && state.refreshFailures > 0) {
        state.refreshFailures--;
        return reply({ error: "The account could not be loaded. Try again." }, 503);
      }
      return reply({ user: persona === "admin" ? admin : state.current });
    }
    if (path === "/api/admin/users") return reply({ users: [admin, state.current] });
    if (path === `/api/admin/users/${CITIZEN_ID}` && method === "GET") {
      if (state.refreshFailures > 0) {
        state.refreshFailures--;
        return reply({ error: "The account could not be loaded. Try again." }, 503);
      }
      return reply({ user: state.current });
    }
    if (path === `/api/admin/users/${CITIZEN_ID}/residency-proof`) {
      const version = url.searchParams.get("expected_version") ?? "";
      state.proofVersions.push(version);
      if (version !== state.current.residency_review_version) return conflict();
      return reply({
        url: proofUrl(state.current.residency_proof_id ?? PROOF_A, state.kind),
        kind: state.kind,
        expires_in: 300,
        residency_proof_id: state.current.residency_proof_id,
        residency_review_version: state.current.residency_review_version,
      });
    }
    if (path === `/api/admin/users/${CITIZEN_ID}/residency` && method === "PATCH") {
      const body = decisionSchema.parse(request.postDataJSON());
      state.decisions.push(body);
      if (body.expected_version !== state.current.residency_review_version) return conflict();
      state.current = {
        ...state.current,
        residency_status: body.decision,
        residency_note: body.note ?? null,
        residency_review_version: VERSION_C,
        residency_reviewed_at: "2026-10-05T04:00:00Z",
        reviewer: { id: admin.id, name: admin.name },
      };
      return reply({ user: state.current });
    }
    if (path === "/api/auth/me/residency-proof" && method === "POST") {
      const bytes = request.postDataBuffer();
      if (!bytes) throw new Error("The simulated upload requires multipart data.");
      const form = await new Response(Uint8Array.from(bytes).buffer, { headers: { "content-type": request.headers()["content-type"] ?? "" } }).formData();
      const file = form.get("proof");
      const upload = {
        id: z.uuid().parse(form.get("submission_id")),
        version: z.uuid().parse(form.get("expected_version")),
        filename: file instanceof File ? file.name : "",
      };
      expect(url.searchParams.get("submission_id")).toBe(upload.id);
      state.uploads.push(upload);
      if (upload.id === state.current.residency_proof_id) return reply({ user: state.current });
      if (state.current.residency_status === "verified") return reply({ error: "Your residency is already confirmed." }, 400);
      if (upload.version !== state.current.residency_review_version) return conflict();
      const attach = () => {
        state.current = { ...state.current, residency_proof_id: upload.id,
          residency_review_version: upload.version === VERSION_A ? VERSION_B : VERSION_C,
          residency_status: "pending", residency_note: null, has_residency_proof: true };
      };
      if (state.uploadFailures > 0) {
        state.uploadFailures--;
        if (state.commitLostUpload) attach();
        return route.abort("failed");
      }
      attach();
      return reply({ user: state.current });
    }
    if (path === "/api/notifications") return reply({ notifications: [], unread: 0 });
    if (path === "/api/admin/analytics") return reply({
      total_reports: 0,
      by_status: {},
      by_category: {},
      resolved_count: 0,
      average_resolution_days: null,
    });
    if (path === "/api/feedback/summary/staff") return reply({ summary: { count: 0, average: null } });
    if (path === "/api/reports") return reply({ reports: [], total: 0, page: 1, per_page: 20 });
    return reply({ error: `Unexpected simulated API request ${method} ${path}` }, 500);
  });
}

async function openReview(page: Page, state: Simulation) {
  await adaptApi(page, state);
  await signIn(page, admin.email);
  await page.getByRole("navigation", { name: "Admin navigation tabs" }).getByRole("link", { name: "Users", exact: true }).click();
  await page.getByRole("button", { name: `Review residency of ${citizen.name}` }).click();
  await expect(page.getByRole("dialog")).toContainText("10 Original Street");
}

function replaceProof(state: Simulation) {
  state.current = {
    ...state.current,
    name: "Updated Citizen",
    barangay: "Bel-Air",
    address_line: "22 Current Street",
    residency_review_version: VERSION_B,
    residency_proof_id: PROOF_B,
  };
}

async function evidence(page: Page, filename: string, fullPage = true) {
  await page.evaluate(() => {
    const label = document.createElement("p");
    label.textContent = "Simulated API responses. Local issue 61 browser evidence.";
    label.style.cssText = "position:fixed;bottom:0;left:0;right:0;z-index:2000;background:white;color:black;padding:8px;margin:0;font:12px sans-serif;border-top:1px solid black";
    label.id = "simulation-evidence-label";
    document.body.append(label);
  });
  await page.screenshot({ path: `tests/evidence/issue61/${filename}`, fullPage });
  await page.locator("#simulation-evidence-label").evaluate((element) => element.remove());
}

test.describe("Residency review with simulated local API responses", () => {
  const browserErrors = new WeakMap<Page, string[]>();
  test.beforeEach(({ page }) => {
    const errors: string[] = [];
    browserErrors.set(page, errors);
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      if (/Failed to load resource:.*(?:409|503|net::ERR_FAILED)/.test(message.text())) return;
      errors.push(message.text());
    });
  });
  test.afterEach(({ page }) => {
    expect(browserErrors.get(page)).toEqual([]);
  });

  test("accepts the displayed version after opening its current image proof", async ({ page }) => {
    const state = simulation();
    await openReview(page, state);
    await page.getByRole("button", { name: "Open proof", exact: true }).click();
    await expect(page.getByRole("img", { name: "Proof of residency uploaded by Local Citizen" })).toHaveAttribute("src", proofUrl(PROOF_A, "image"));
    await page.getByRole("button", { name: "Accept as resident" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText("Local Citizen is now a verified resident.", { exact: true })).toBeVisible();
    expect(state.proofVersions).toEqual([VERSION_A]);
    expect(state.decisions).toEqual([{ decision: "verified", expected_version: VERSION_A }]);
  });

  for (const decision of ["verified", "rejected"] as const) {
    test(`keeps a stale ${decision} decision open until a full refresh succeeds`, async ({ page }) => {
      const state = simulation();
      await openReview(page, state);
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: "Open proof", exact: true }).click();
      await expect(dialog.getByRole("img")).toBeVisible();
      if (decision === "rejected") {
        await dialog.getByRole("button", { name: "Reject…", exact: true }).click();
        await dialog.getByRole("textbox", { name: "Reason" }).fill("The original address is not clear.");
      }
      replaceProof(state);
      await dialog.getByRole("button", { name: decision === "verified" ? "Accept as resident" : "Reject and ask again" }).click();
      await expect(dialog.getByRole("button", { name: "Refresh review", exact: true })).toBeVisible();
      await expect(dialog.getByRole("img")).toBeHidden();
      await expect(dialog.getByRole("button", { name: decision === "verified" ? "Accept as resident" : "Reject and ask again" })).toBeDisabled();
      await expect(dialog).toContainText("10 Original Street");
      await expect(page.getByText(/is now a verified resident|was asked for a new proof/)).toHaveCount(0);
      if (decision === "verified") await evidence(page, "simulated-approval-conflict-desktop.png");
      await dialog.getByRole("button", { name: "Refresh review", exact: true }).click();
      await expect(dialog).toContainText("Updated Citizen");
      await expect(dialog).toContainText("22 Current Street");
      await expect(dialog).toContainText("Bel-Air");
      await expect(dialog.getByRole("img")).toBeHidden();
      await dialog.getByRole("button", { name: "Reject…", exact: true }).click();
      await expect(dialog.getByRole("textbox", { name: "Reason" })).toHaveValue("");
      await dialog.getByRole("button", { name: "Back", exact: true }).click();
      if (decision === "verified") await evidence(page, "simulated-refreshed-review-desktop.png");
      await dialog.getByRole("button", { name: "Open proof", exact: true }).click();
      await expect(dialog.getByRole("img")).toHaveAttribute("src", proofUrl(PROOF_B, "image"));
      await dialog.getByRole("button", { name: "Accept as resident" }).click();
      await expect(dialog).toBeHidden();
      expect(state.proofVersions).toEqual([VERSION_A, VERSION_B]);
      expect(state.decisions.map(({ expected_version }) => expected_version)).toEqual([VERSION_A, VERSION_B]);
    });
  }

  test("blocks decisions after stale proof access and a failed refresh", async ({ page }) => {
    const state = simulation();
    await openReview(page, state);
    replaceProof(state);
    state.refreshFailures = 1;
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Open proof", exact: true }).click();
    await dialog.getByRole("button", { name: "Refresh review", exact: true }).click();
    await expect(dialog).toContainText("Could not refresh the review");
    await expect(dialog.getByRole("button", { name: "Accept as resident" })).toBeDisabled();
    await expect(dialog).toContainText("10 Original Street");
    await expect(dialog.getByRole("img")).toBeHidden();
    await dialog.getByRole("button", { name: "Refresh review", exact: true }).click();
    await expect(dialog).toContainText("22 Current Street");
    await expect(dialog.getByRole("button", { name: "Accept as resident" })).toBeEnabled();
    expect(state.decisions).toEqual([]);
    expect(state.proofVersions).toEqual([VERSION_A]);
  });

  test("discards a late proof response after conflict and refresh", async ({ page }) => {
    const state = simulation();
    await openReview(page, state);
    let release = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route(`**/api/admin/users/${CITIZEN_ID}/residency-proof?**`, async (route) => {
      await gate;
      await route.fulfill({ json: {
        url: proofUrl(PROOF_A, "image"),
        kind: "image",
        expires_in: 300,
        residency_proof_id: PROOF_A,
        residency_review_version: VERSION_A,
      } });
    });
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Open proof", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Opening...", exact: true })).toBeVisible();
    replaceProof(state);
    await dialog.getByRole("button", { name: "Accept as resident" }).click();
    await dialog.getByRole("button", { name: "Refresh review", exact: true }).click();
    await expect(dialog).toContainText("22 Current Street");
    const oldResponse = page.waitForResponse((response) => response.url().includes("residency-proof"));
    release();
    await oldResponse;
    await expect(dialog.getByRole("img")).toBeHidden();
    await expect(dialog.getByRole("button", { name: "Open proof", exact: true })).toBeEnabled();
    await page.unroute(`**/api/admin/users/${CITIZEN_ID}/residency-proof?**`);
    await dialog.getByRole("button", { name: "Open proof", exact: true }).click();
    await expect(dialog.getByRole("img")).toHaveAttribute("src", proofUrl(PROOF_B, "image"));
  });

  test("keeps refresh and decision controls in view on a mobile conflict", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const state = simulation();
    await openReview(page, state);
    replaceProof(state);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Accept as resident" }).click();
    await expect(dialog.getByRole("button", { name: "Refresh review", exact: true })).toBeInViewport();
    await expect(dialog.getByRole("button", { name: "Accept as resident" })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await evidence(page, "simulated-approval-conflict-mobile.png", false);
    await dialog.getByRole("button", { name: "Refresh review", exact: true }).click();
    await expect(dialog).toContainText("22 Current Street");
    await expect(dialog.getByRole("button", { name: "Accept as resident" })).toBeEnabled();
  });

  test("shows the first reviewer's decision when a second reviewer refreshes", async ({ page, browser }) => {
    const state = simulation();
    await openReview(page, state);
    const secondContext = await browser.newContext({ baseURL: "http://127.0.0.1:5174" });
    const second = await secondContext.newPage();
    try {
      await openReview(second, state);
      await page.getByRole("button", { name: "Accept as resident" }).click();
      await expect(page.getByRole("dialog")).toBeHidden();
      await second.getByRole("button", { name: "Accept as resident" }).click();
      await expect(second.getByRole("dialog")).toContainText("Refresh review");
      await second.getByRole("button", { name: "Refresh review", exact: true }).click();
      await expect(second.getByRole("dialog")).toContainText("Verified resident");
      await expect(second.getByRole("dialog")).toContainText("by Local Administrator");
      await expect(second.getByRole("button", { name: "Accept as resident" })).toBeHidden();
      expect(state.decisions).toEqual([
        { decision: "verified", expected_version: VERSION_A },
        { decision: "verified", expected_version: VERSION_A },
      ]);
    } finally {
      await secondContext.close();
    }
  });

  test("accepts a known resident without a document using the displayed version", async ({ page }) => {
    const state = simulation();
    state.current = { ...state.current, has_residency_proof: false, residency_proof_id: null };
    await openReview(page, state);
    await expect(page.getByRole("dialog")).toContainText("No proof uploaded yet");
    await page.getByRole("button", { name: "Accept as resident" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    expect(state.decisions).toEqual([{ decision: "verified", expected_version: VERSION_A }]);
    expect(state.proofVersions).toEqual([]);
  });

  for (const kind of ["image", "pdf"] as const) {
    test(`keeps the old ${kind} URL bound to its document until refresh opens the replacement`, async ({ page }) => {
      const state = simulation();
      state.kind = kind;
      await openReview(page, state);
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: "Open proof", exact: true }).click();
      const oldLink = dialog.locator(`a[href='${proofUrl(PROOF_A, kind)}']`);
      await expect(oldLink).toBeVisible();
      await expect(oldLink).toHaveAttribute("target", "_blank");
      const firstTab = page.waitForEvent("popup");
      await oldLink.click();
      const oldDocument = await firstTab;
      await expect(oldDocument).toHaveURL(`http://127.0.0.1:5174${proofUrl(PROOF_A, kind)}`);
      replaceProof(state);
      await expect(oldLink).toHaveAttribute("href", proofUrl(PROOF_A, kind));
      await dialog.getByRole("button", { name: "Accept as resident" }).click();
      await dialog.getByRole("button", { name: "Refresh review", exact: true }).click();
      await dialog.getByRole("button", { name: "Open proof", exact: true }).click();
      await expect(dialog.locator(`a[href='${proofUrl(PROOF_B, kind)}']`)).toBeVisible();
      expect(oldDocument.url()).toContain(proofUrl(PROOF_A, kind));
      await oldDocument.close();
      expect(state.proofVersions).toEqual([VERSION_A, VERSION_B]);
    });
  }

  test("retries one upload identity and preserves a newer confirmed review", async ({ page }) => {
    const state = simulation();
    state.current = { ...state.current, residency_status: "rejected" };
    state.uploadFailures = 1;
    state.commitLostUpload = true;
    await adaptApi(page, state, "citizen");
    await signIn(page, citizen.email);
    await page.locator("#proof").setInputFiles({ name: "proof.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\nproof") });
    await page.getByRole("button", { name: "Send proof", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Could not send your proof" })).toBeVisible();
    state.current = { ...state.current, residency_status: "verified", residency_review_version: VERSION_C };
    await page.getByRole("button", { name: "Send proof", exact: true }).click();
    await expect(page).toHaveURL(/\/my-reports/);
    await expect(page.getByRole("heading", { name: "My reports" })).toBeVisible();
    await page.getByRole("link", { name: "My account", exact: true }).click();
    await expect(page.getByText("Verified resident", { exact: true })).toBeVisible();
    expect(state.uploads).toHaveLength(2);
    expect(state.uploads[0]?.id).toEqual(state.uploads[1]?.id);
    expect(state.uploads.map(({ version }) => version)).toEqual([VERSION_A, VERSION_A]);
    expect(state.uploads.map(({ filename }) => filename)).toEqual(["proof.pdf", "proof.pdf"]);
  });

  test("uses a new submission identity when the selected file changes", async ({ page }) => {
    const state = simulation();
    state.current = { ...state.current, residency_status: "rejected" };
    state.uploadFailures = 2;
    await adaptApi(page, state, "citizen");
    await signIn(page, citizen.email);
    await page.locator("#proof").setInputFiles({ name: "first.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\nfirst") });
    await page.getByRole("button", { name: "Send proof", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Could not send your proof" })).toBeVisible();
    await page.locator("#proof").setInputFiles({ name: "second.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\nsecond") });
    await page.getByRole("button", { name: "Send proof", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Could not send your proof" })).toBeVisible();
    await expect.poll(() => state.uploads.length).toBe(2);
    expect(state.uploads).toHaveLength(2);
    expect(state.uploads[0]?.id).not.toEqual(state.uploads[1]?.id);
    expect(state.uploads.map(({ filename }) => filename)).toEqual(["first.pdf", "second.pdf"]);
  });

  test("uses a fresh identity after a confirmed upload succeeds", async ({ page }) => {
    const state = simulation();
    await adaptApi(page, state, "citizen");
    await signIn(page, citizen.email);
    await page.getByRole("link", { name: "My account", exact: true }).click();
    const proof = { name: "proof.pdf", mimeType: "application/pdf", buffer: PDF };
    await page.locator("#proof").setInputFiles(proof);
    await page.getByRole("button", { name: "Send proof", exact: true }).click();
    await expect(page.getByText("Proof sent. An administrator will review it.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send proof", exact: true })).toBeDisabled();
    state.current = { ...state.current, residency_review_version: VERSION_B };
    await page.locator("#proof").setInputFiles(proof);
    await page.getByRole("button", { name: "Send proof", exact: true }).click();
    await expect(page.getByRole("button", { name: "Send proof", exact: true })).toBeDisabled();
    await expect.poll(() => state.uploads.length).toBe(2);
    expect(state.uploads[0]?.id).not.toEqual(state.uploads[1]?.id);
    expect(state.uploads.map(({ filename }) => filename)).toEqual(["proof.pdf", "proof.pdf"]);
    expect(state.uploads.map(({ version }) => version)).toEqual([VERSION_A, VERSION_B]);
  });

  for (const refreshedStatus of ["pending", "rejected"] as const) {
    test(`refreshes a ${refreshedStatus} upload conflict and keeps the selected file for an explicit new submission`, async ({ page }) => {
      const state = simulation();
      await adaptApi(page, state, "citizen");
      await signIn(page, citizen.email);
      await page.getByRole("link", { name: "My account", exact: true }).click();
      const accountUrl = page.url();
      await page.locator("#proof").setInputFiles({ name: "proof.pdf", mimeType: "application/pdf", buffer: PDF });
      replaceProof(state);
      state.current = { ...state.current, residency_status: refreshedStatus,
        residency_note: refreshedStatus === "rejected" ? "The address does not match." : null };
      await page.getByRole("button", { name: "Send proof", exact: true }).click();
      await expect(page.getByRole("button", { name: "Refresh account", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Send proof", exact: true })).toBeDisabled();
      const first = state.uploads[0];
      state.refreshFailures = 1;
      await page.getByRole("button", { name: "Refresh account", exact: true }).click();
      await expect(page.getByRole("alert").filter({ hasText: "Could not refresh your account" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Send proof", exact: true })).toBeDisabled();
      await page.getByRole("button", { name: "Refresh account", exact: true }).click();
      await expect(page.getByRole("alert").filter({ hasText: "Account refreshed" })).toContainText("22 Current Street");
      await expect(page).toHaveURL(accountUrl);
      if (refreshedStatus === "rejected") await expect(page.getByRole("alert").filter({ hasText: "Your last proof was not accepted" })).toContainText("The address does not match.");
      await expect(page.getByRole("button", { name: "Send proof", exact: true })).toBeEnabled();
      expect(state.uploads).toHaveLength(1);
      await page.getByRole("button", { name: "Send proof", exact: true }).click();
      await expect(page.getByText("Proof sent. An administrator will review it.", { exact: true })).toBeVisible();
      expect(state.uploads[1]).toMatchObject({ version: VERSION_B, filename: "proof.pdf" });
      expect(state.uploads[1]?.id).not.toBe(first?.id);
    });
  }

  for (const status of ["verified", "rejected"] as const) {
    test(`shows a later ${status} decision after a committed upload retry`, async ({ page }) => {
      const state = simulation();
      state.uploadFailures = 1;
      state.commitLostUpload = true;
      await adaptApi(page, state, "citizen");
      await signIn(page, citizen.email);
      await page.getByRole("link", { name: "My account", exact: true }).click();
      await page.locator("#proof").setInputFiles({ name: "proof.pdf", mimeType: "application/pdf", buffer: PDF });
      await page.getByRole("button", { name: "Send proof", exact: true }).click();
      await expect(page.getByRole("alert").filter({ hasText: "Could not send your proof" })).toBeVisible();
      state.current = { ...state.current, residency_status: status, residency_review_version: VERSION_C,
        residency_note: status === "rejected" ? "The address does not match." : null };
      await page.getByRole("button", { name: "Send proof", exact: true }).click();
      await expect(page.getByText(status === "verified" ? "Your residency is confirmed."
        : "Your proof was not accepted. Select a new proof to try again.", { exact: true })).toBeVisible();
      expect(state.uploads[0]?.id).toBe(state.uploads[1]?.id);
      expect(state.uploads.map(({ version }) => version)).toEqual([VERSION_A, VERSION_A]);
      await expect(page.getByText("Proof sent. An administrator will review it.", { exact: true })).toBeHidden();
      if (status === "rejected") await expect(page.getByRole("alert").filter({ hasText: "Your last proof was not accepted" })).toContainText("The address does not match.");
    });
  }
});
