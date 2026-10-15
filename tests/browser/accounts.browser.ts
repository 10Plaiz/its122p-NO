import { test, expect, type Browser, type Page } from "@playwright/test";
import { captureEvidence, expectProofAccepted, FIXTURE_PASSWORD, latestCode, mailpitAvailable, signIn, USERS } from "./helpers.js";

// Account flows (UA-5, UA-8, UA-9, UA-12) end to end. They create real accounts and
// read the emailed codes from Mailpit, so they run only against a local Supabase
// (`bunx supabase start`), never a shared project. Accounts are never deleted
// (DM-1), so each run uses fresh addresses.
//
// One citizen goes through the whole life of an account, step by step, so the
// tests run in order and share it.
test.describe.configure({ mode: "serial" });

const PASSWORD = "Str0ng!pass";
const stamp = Date.now();
const NEW = `test-account-${stamp}@kamoti.invalid`;
const UNCONFIRMED = `test-unconfirmed-${stamp}@kamoti.invalid`;

// A real 1x1 PNG and a minimal PDF, both accepted proofs of residency.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

async function fillRegister(page: Page, email: string) {
  await page.goto("/register");
  await page.fill("#first-name", "Ana");
  await page.fill("#last-name", "Reyes");
  await page.fill("#email", email);
  await page.selectOption("#barangay", "Poblacion");
  await page.fill("#address", "123 J.P. Rizal Street");
  await page.fill("#password", PASSWORD);
  await page.check("#consent");
  await page.click('button[type="submit"]');
}

const CODE_REFUSED = "That code is wrong or has expired";

// A code Supabase already accepted must not work a second time.
async function expectCodeUsedUp(page: Page, path: string, data: Record<string, string>) {
  const response = await page.request.post(path, { data });
  expect(response.status()).toBe(400);
  expect((await response.json()).error).toContain(CODE_REFUSED);
}

const tokenStatus = (page: Page, path: string) =>
  page.evaluate(async (url) => {
    const token = localStorage.getItem("kamoti.token");
    return (await fetch(url, { headers: { Authorization: `Bearer ${token}` } })).status;
  }, path);

let citizen: Page;

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  test.skip(!(await mailpitAvailable()), "Needs Mailpit from a local Supabase (bunx supabase start).");
  citizen = await (await browser.newContext()).newPage();
});

test("UA-5: registering sends a 6-digit code; a wrong code is refused, the right one signs in", async () => {
  const since = Date.now();
  await fillRegister(citizen, NEW);
  await expect(citizen.getByText("Confirm your email")).toBeVisible();

  await citizen.fill("#email-code", "000000");
  await citizen.getByRole("button", { name: "Confirm email" }).click();
  await expect(citizen.getByText("Could not confirm your email")).toBeVisible();

  const code = await latestCode(NEW, since, "sign-up code");
  await citizen.fill("#email-code", code);
  await citizen.getByRole("button", { name: "Confirm email" }).click();
  await citizen.waitForURL(/register\?step=proof/);
  await captureEvidence(citizen, "UA-5-code-confirmed-proof-step.png");

  await expectCodeUsedUp(citizen, "/api/auth/verify-email", { email: NEW, token: code });
});

test("UA-8: until a proof is sent the citizen is locked: greyed menu, redirect, and a 403 from the API", async () => {
  expect(await citizen.locator('nav a[aria-disabled="true"]').count()).toBeGreaterThanOrEqual(3);
  await citizen.goto("/my-reports");
  await citizen.waitForURL(/register\?step=proof/);
  expect(await tokenStatus(citizen, "/api/reports")).toBe(403);

  await citizen.setInputFiles("#proof", { name: "bill.pdf", mimeType: "application/pdf", buffer: PDF });
  await citizen.getByRole("button", { name: "Send proof" }).click();
  await expectProofAccepted(citizen);
});

test("UA-8: an administrator rejects the proof with a reason; the citizen sees it and sends another", async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, USERS.admin, FIXTURE_PASSWORD);
  await admin.goto("/admin/users");
  await admin.selectOption("#residency-filter", "pending");
  const row = admin.locator("tr", { hasText: NEW });
  await row.getByRole("button", { name: /Review/ }).click();
  await admin.getByRole("button", { name: "Open proof" }).click();
  await expect(admin.getByText("Open the PDF in a new tab")).toBeVisible();
  await admin.getByRole("button", { name: "Reject…" }).click();
  await admin.fill("#residency-note", "The bill is too blurry to read the address.");
  await admin.getByRole("button", { name: "Reject and ask again" }).click();
  await expect(admin.getByText("was asked for a new proof")).toBeVisible();
  await admin.close();

  await citizen.goto("/my-reports");
  await citizen.waitForURL(/register\?step=proof/);
  await expect(citizen.getByText("The bill is too blurry")).toBeVisible();
  await captureEvidence(citizen, "UA-8-rejected-with-reason.png");
  await citizen.setInputFiles("#proof", { name: "bill.png", mimeType: "image/png", buffer: PNG });
  await citizen.getByRole("button", { name: "Send proof" }).click();
  await expectProofAccepted(citizen);
});

test("UA-8: an administrator accepts the new proof; the citizen is a verified resident", async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, USERS.admin, FIXTURE_PASSWORD);
  await admin.goto("/admin/users");
  await admin.selectOption("#residency-filter", "pending");
  const row = admin.locator("tr", { hasText: NEW });
  await row.getByRole("button", { name: /Review/ }).click();
  await admin.getByRole("button", { name: "Open proof" }).click();
  await expect(admin.getByAltText("Proof of residency uploaded by Ana Reyes")).toBeVisible();
  // #63: all four checks before the document can be accepted.
  const accept = admin.getByRole("button", { name: "Accept the document" });
  await expect(accept).toBeDisabled();
  for (const box of await admin.getByRole("checkbox").all()) await box.check();
  await accept.click();
  await expect(admin.getByText("Ana Reyes is now a verified resident.")).toBeVisible();
  await admin.close();

  await citizen.goto("/notifications");
  await expect(citizen.getByText("Your proof of residency was accepted")).toBeVisible();
  await citizen.goto("/account");
  await expect(citizen.getByText("Verified resident", { exact: true }).first()).toBeVisible();
  await captureEvidence(citizen, "UA-8-approved.png");

  // A verified resident has nothing more to upload, even by a direct request.
  const upload = await citizen.evaluate(async () => {
    const response = await fetch("/api/auth/me/residency-proof", {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("kamoti.token")}` },
      body: new FormData(),
    });
    return { status: response.status, error: ((await response.json()) as { error: string }).error };
  });
  expect(upload).toEqual({ status: 400, error: "Your residency is already confirmed. There is nothing more to upload." });
});

test("UA-5: signing in before confirming switches to the code step", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await fillRegister(page, UNCONFIRMED);
  await expect(page.getByText("Confirm your email")).toBeVisible();
  await page.goto("/signin");
  await page.fill("#email", UNCONFIRMED);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await expect(page.getByText("Your email address is not confirmed yet")).toBeVisible();
  await page.close();
});

test("UA-12: a password reset by emailed code works and signs out the other sessions", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/signin");
  await page.getByText("Forgot your password?").click();
  await page.fill("#reset-email", NEW);
  const since = Date.now();
  await page.getByRole("button", { name: "Send reset code" }).click();
  await page.locator("#reset-code").waitFor();
  const code = await latestCode(NEW, since, "password reset code");

  await page.fill("#reset-code", "000000");
  await page.fill("#new-password", "N3w!password");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText(CODE_REFUSED)).toBeVisible();

  await page.fill("#reset-code", code);
  await page.fill("#new-password", "N3w!password");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password changed")).toBeVisible();
  await expectCodeUsedUp(page, "/api/auth/reset-password", { email: NEW, token: code, password: "An0ther!pass" });
  await page.fill("#password", "N3w!password");
  await page.click('button[type="submit"]');
  await page.waitForURL(/my-reports/);

  // The citizen's earlier session was ended by the reset.
  expect(await tokenStatus(citizen, "/api/auth/me")).toBe(401);
  citizen = page;
});

test("UA-9: a refused access token is refreshed and the page still loads", async () => {
  const before = await citizen.evaluate(() => localStorage.getItem("kamoti.token"));
  await citizen.evaluate(() => localStorage.setItem("kamoti.token", "expired.or.garbage"));
  await citizen.goto("/my-reports");
  await citizen.waitForLoadState("networkidle");
  const after = await citizen.evaluate(() => localStorage.getItem("kamoti.token"));
  expect(citizen.url()).toContain("my-reports");
  expect(after).toBeTruthy();
  expect(after).not.toBe("expired.or.garbage");
  expect(after).not.toBe(before);
});

test("UA-9: 15 idle minutes bring a warning; staying keeps the session, more idle time signs out", async () => {
  await citizen.evaluate(() => localStorage.setItem("kamoti.activity", String(Date.now() - 15 * 60_000 - 3_000)));
  await expect(citizen.getByRole("alertdialog")).toBeVisible({ timeout: 5000 });
  await captureEvidence(citizen, "UA-9-idle-warning.png");
  await citizen.getByRole("button", { name: "Stay signed in" }).click();
  await expect(citizen.getByRole("alertdialog")).toHaveCount(0);

  await citizen.evaluate(() => localStorage.setItem("kamoti.activity", String(Date.now() - 17 * 60_000)));
  await citizen.waitForURL(/signin/, { timeout: 5000 });
  await expect(citizen.getByText("without activity")).toBeVisible();
  expect(await citizen.evaluate(() => localStorage.getItem("kamoti.token"))).toBeNull();
});
