import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const FIXTURE_PASSWORD = process.env.FIXTURE_PASSWORD ?? "Password123!";

export const USERS = {
  admin: "fixture-admin@kamoti.invalid",
  citizen1: "fixture-citizen-1@kamoti.invalid",
  citizen2: "fixture-citizen-2@kamoti.invalid",
  staff1: "fixture-staff-1@kamoti.invalid",
  staff2: "fixture-staff-2@kamoti.invalid",
} as const;

// Mark synthetic test writes. Explicitly authorized disposable cleanup uses these
// constants to identify fixture-owned records; shared verification retains them.
export const TEST_TITLE_PREFIX = "[TEST]";
export const TEST_REMARK = "Staff on-site assessment complete. Scheduled for follow-up review.";

export async function signIn(page: Page, email: string, password = FIXTURE_PASSWORD) {
  await page.goto("/signin");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForLoadState("networkidle");
}

export async function signOut(page: Page) {
  const signOutBtn = page.locator('button:has-text("Sign out")');
  if (await signOutBtn.isVisible()) {
    await signOutBtn.click();
    await page.waitForLoadState("networkidle");
  }
}

// Screenshots land in tests/evidence/ unless EVIDENCE_DIR names another folder, so a
// run against a different target can keep its set apart from the committed one.
const EVIDENCE_DIR = process.env.EVIDENCE_DIR ?? "tests/evidence";

export async function captureEvidence(page: Page, filename: string) {
  await page.screenshot({
    path: `${EVIDENCE_DIR}/${filename}`,
    fullPage: true,
  });
}

// Inside Makati (Ayala Avenue). Report flows place their pin with "Use my location"
// set to this point, so they work with or without a Google Maps key (MP-2 refuses
// any pin outside the city).
export const MAKATI_POINT = { latitude: 14.5547, longitude: 121.0244 };

export async function placePinByLocation(page: Page) {
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation(MAKATI_POINT);
  await page.getByRole("button", { name: "Use my location" }).click();
  await expect(page.getByTestId("selected-coordinates")).toContainText("14.55470");
}

// Checks that need the real Google map. Without VITE_GOOGLE_MAPS_API_KEY the map is
// replaced by its "Map unavailable" fallback, and those checks are skipped.
export async function mapAvailable(page: Page) {
  await page.waitForLoadState("networkidle");
  return (await page.getByTestId("map-unavailable").count()) === 0;
}

// A signed-in API session for set-up steps a test is not about.
export async function apiToken(request: APIRequestContext, email: string, password = FIXTURE_PASSWORD) {
  const response = await request.post("/api/auth/login", { data: { email, password } });
  expect(response.ok(), `sign in as ${email}`).toBe(true);
  return ((await response.json()) as { access_token: string }).access_token;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

// Local Supabase delivers its email to Mailpit. The account-flow tests read codes
// from it, so they run only where it answers (never against a shared project).
export const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

export async function mailpitAvailable() {
  try {
    return (await fetch(`${MAILPIT_URL}/api/v1/messages?limit=1`)).ok;
  } catch {
    return false;
  }
}

// The newest 6-digit code sent to `address` since `since`, whose subject includes
// `subjectPart` (the templates in supabase/templates).
export async function latestCode(address: string, since: number, subjectPart: string) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`).then((r) => r.json());
    const message = (search.messages ?? []).find(
      (m: { Created: string; Subject: string }) => Date.parse(m.Created) >= since - 2000 && m.Subject.includes(subjectPart),
    );
    if (message) {
      const full = await fetch(`${MAILPIT_URL}/api/v1/message/${message.ID}`).then((r) => r.json());
      const code = String(full.Text ?? full.HTML ?? "").match(/\b(\d{6})\b/)?.[1];
      if (code) return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No "${subjectPart}" email for ${address}`);
}
