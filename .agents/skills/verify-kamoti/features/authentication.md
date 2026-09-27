# Feature Map: Authentication and Session Management

Route: `/signin`, `/register`
Persona: Public Visitor / Registered User (Citizen, Staff, Admin)

## Sub-features
- **Sign-in Authentication (`/signin`):** Email and password submission with server verification and error alerts for bad credentials.
- **Sign-in Form Exception:** The Sign-in button remains enabled even when empty. This exception prevents browser password autofill from becoming trapped and allows server validation.
- **Registration Form Validity (`/register`):** The "Create account" button remains disabled until all fields are valid. Leaving an invalid field triggers inline error messages (`KR-07`).
- **Screen Reader Announcements:** Controls with validation errors carry `aria-invalid="true"` and an `aria-describedby` attribute resolving to the error note ID (`KR-08`).
- **Role-Based Workspace Redirection:** Successful authentication redirects to role-specific destinations:
  - Citizen redirects to `/my-reports`.
  - Staff redirects to `/staff/queue`.
  - Administrator redirects to `/admin`.
- **Protected Route Guards:** Navigating to protected routes without a valid session token triggers an immediate redirect to `/signin`.
- **Session Termination:** Clicking "Sign out" in the header clears the local session and returns the user to `/signin`.

## How to get to it (user POV)
1. Navigate to `/signin` directly or click "Sign in" in the top navigation.
2. Enter registered credentials and submit the form.
3. The application redirects to the appropriate role workspace.
4. To create a new citizen account, click "Create one now" to open `/register`.

## Driving it with Playwright

```typescript
import { test, expect } from "@playwright/test";
import { captureEvidence, FIXTURE_PASSWORD, signIn, signOut, USERS } from "./helpers.js";

test("Authentication: Citizen sign-in and workspace redirect", async ({ page }) => {
  await signIn(page, USERS.citizen1, FIXTURE_PASSWORD);
  await expect(page).toHaveURL(/.*my-reports/);
  await expect(page.locator('[data-testid="user-identity"]')).toContainText("Citizen");
  await captureEvidence(page, "AUTH-04-citizen-login.png");
});

test("Authentication: Register form disabled until valid", async ({ page }) => {
  await page.goto("/register");
  const submitBtn = page.locator('button[type="submit"]');
  await expect(submitBtn).toBeDisabled();

  // Entering invalid input and leaving field reveals error
  const nameInput = page.locator("#name");
  await nameInput.fill("A");
  await nameInput.blur();
  await expect(nameInput).toHaveAttribute("aria-invalid", "true");

  // Valid inputs enable the submit button
  await nameInput.fill("Juan Dela Cruz");
  await page.fill("#email", "juan.delacruz@example.ph");
  await page.fill("#password", "SecurePassword123!");
  await expect(submitBtn).toBeEnabled();
});

test("Authentication: Sign-out clears session", async ({ page }) => {
  await signIn(page, USERS.citizen1, FIXTURE_PASSWORD);
  await signOut(page);
  await expect(page).toHaveURL(/.*signin/);
  await captureEvidence(page, "AUTH-11-logout.png");
});
```

## Gotchas
- **Case-Sensitive Role Display Labels:** Header user indicators display Title Case strings such as "Citizen", "Staff", and "Administrator". Browser test assertions using `toContainText` must match the exact capitalization.
- **Sign-in Button State:** Unlike registration and wizard forms, the Sign-in button is never disabled when inputs are empty.
- **Untouched Field Errors:** Forms do not show red error notes upon initial display. Errors render only after a field has been blurred or upon form submission.
