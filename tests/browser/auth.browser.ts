import { test, expect } from "@playwright/test";
import { captureEvidence, FIXTURE_PASSWORD, signIn, signOut, USERS } from "./helpers.js";

test.describe("Authentication workflows (AUTH-04 through AUTH-11)", () => {
  test.beforeEach(async ({ page }) => {
    // Clear cookies and storage for a clean session state
    await page.context().clearCookies();
  });

  test("AUTH-04: Valid citizen login routes to citizen workspace and captures evidence", async ({ page }) => {
    await signIn(page, USERS.citizen1, FIXTURE_PASSWORD);
    await expect(page).toHaveURL(/.*my-reports/);
    await expect(page.locator("body")).toContainText("citizen");
    await captureEvidence(page, "AUTH-04-citizen-login.png");
  });

  test("AUTH-05: Valid staff login routes to staff queue and captures evidence", async ({ page }) => {
    await signIn(page, USERS.staff1, FIXTURE_PASSWORD);
    await expect(page).toHaveURL(/.*staff\/queue/);
    await expect(page.locator("body")).toContainText("staff");
    await captureEvidence(page, "AUTH-05-staff-login.png");
  });

  test("AUTH-06: Valid administrator login routes to admin dashboard and captures evidence", async ({ page }) => {
    await signIn(page, USERS.admin, FIXTURE_PASSWORD);
    await expect(page).toHaveURL(/.*admin/);
    await expect(page.locator("body")).toContainText("admin");
    await captureEvidence(page, "AUTH-06-admin-login.png");
  });

  test("AUTH-07: Incorrect password displays error alert and captures evidence", async ({ page }) => {
    await page.goto("/signin");
    await page.fill("#email", USERS.citizen1);
    await page.fill("#password", "WrongPassword999!");
    await page.click('button[type="submit"]');
    await expect(page.locator('[role="alert"]')).toBeVisible();
    await captureEvidence(page, "AUTH-07-invalid-password.png");
  });

  test("AUTH-08: Unknown account email displays error alert and captures evidence", async ({ page }) => {
    await page.goto("/signin");
    await page.fill("#email", "nonexistent-user@kamoti.invalid");
    await page.fill("#password", FIXTURE_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page.locator('[role="alert"]')).toBeVisible();
    await captureEvidence(page, "AUTH-08-unknown-email.png");
  });

  test("AUTH-09: Empty login form submission displays validation errors and captures evidence", async ({ page }) => {
    await page.goto("/signin");
    await page.click('button[type="submit"]');
    // An empty field is a missing value, not a malformed one, and the form now says so.
    // A malformed address still reports "Enter a valid email address."
    await expect(page.locator("body")).toContainText("Enter your email address.");
    await expect(page.locator("body")).toContainText("Enter your password.");
    await captureEvidence(page, "AUTH-09-empty-form.png");
  });

  test("AUTH-10: Protected route access without session redirects to sign-in and captures evidence", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/.*signin/);
    await captureEvidence(page, "AUTH-10-protected-redirect.png");
  });

  test("AUTH-11: User logout clears session and captures evidence", async ({ page }) => {
    await signIn(page, USERS.citizen1, FIXTURE_PASSWORD);
    await expect(page).toHaveURL(/.*my-reports/);
    await signOut(page);
    await expect(page).toHaveURL(/.*signin/);
    await expect(page.locator("h2")).toContainText("Sign in");
    await captureEvidence(page, "AUTH-11-logout.png");
  });
});
