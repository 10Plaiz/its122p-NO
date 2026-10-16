import { test, expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

const profile = { id: 'account-fixture', name: 'Ana Reyes', first_name: 'Ana', middle_name: null, last_name: 'Reyes', suffix: null, email: 'ana@kamoti.invalid', role: 'citizen', is_active: true, barangay: 'Poblacion', address_line: 'Unit 4B, 12 J.P. Rizal Street', contact_number: null, phone_verified_at: null, residency_status: 'verified', has_residency_proof: true };
const session = () => ({ user: profile, access_token: 'simulated-session', expires_at: Math.floor(Date.now() / 1000) + 3600 });
async function fixtures(context: BrowserContext) {
  await context.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/login') return route.fulfill({ json: session() });
    if (path === '/api/auth/me') return route.fulfill({ json: { user: profile } });
    if (path === '/api/auth/logout') return route.fulfill({ status: 204 });
    if (path === '/api/reports') return route.fulfill({ json: { reports: [], total: 0, page: 1, page_size: 10 } });
    if (path === '/api/notifications') return route.fulfill({ json: { notifications: [], unread_count: 0 } });
    return route.fulfill({ json: {} });
  });
}
async function login(page: Page) {
  await page.goto('/signin');
  await page.locator('#email').fill(profile.email);
  await page.locator('#password').fill('Original123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
}

test('a login reaches an already-open signed-out tab', async ({ page, context }) => {
  await fixtures(context);
  await page.goto('/signin');
  const other = await context.newPage();
  await other.goto('/signin');
  await login(page);
  await expect(other.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
});

async function fillRegistration(page: Page) {
  await page.locator('#first-name').fill('Ana');
  await page.locator('#last-name').fill('Reyes');
  await page.locator('#email').fill(profile.email);
  await page.locator('#barangay').selectOption('Poblacion');
  await page.locator('#address').fill('J.P. Rizal Street');
  await page.locator('#password').fill('Original123!');
  await page.locator('#consent').check();
}
async function paste(page: Page, id: string, value: string) {
  await page.locator(id).evaluate((element, text) => {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, value);
}

test('phone input caps typing and cleans pasted text with explicit feedback', async ({ page }) => {
  await page.goto('/register');
  await page.locator('#contact').pressSequentially('0917123456789');
  if (process.env.ACCOUNT_BASELINE) await page.screenshot({ path: 'tests/evidence/account/register-before-desktop.png', fullPage: true });
  await expect(page.locator('#contact')).toHaveValue('09171234567');
  await page.locator('#contact').fill('');
  await paste(page, '#contact', '09 17123-456789');
  await expect(page.locator('#contact')).toHaveValue('09171234567');
  await expect(page.getByText('Check your number before saving.', { exact: false })).toBeVisible();
  await page.locator('#contact').fill('08171234567');
  await page.locator('#contact').blur();
  await expect(page.getByText('Enter an 11-digit mobile number starting with 09.')).toBeVisible();
  await page.locator('#contact').fill('');
  await page.locator('#contact').blur();
  await expect(page.getByText('Enter an 11-digit mobile number starting with 09.')).toHaveCount(0);
});

test('registration submits canonical suffix and an optional number through address_line', async ({ page, context }) => {
  await fixtures(context);
  let input: Record<string, unknown> | undefined;
  await context.route('**/api/auth/register', async (route) => {
    input = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { email: profile.email } });
  });
  await page.goto('/register');
  await fillRegistration(page);
  await page.locator('#suffix').fill('Esq.');
  await page.locator('#suffix').blur();
  await expect(page.getByText('Use Jr., Sr., II, III, IV, or V, or leave it blank.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeDisabled();
  await page.locator('#suffix').fill('jr');
  await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeEnabled();
  await page.locator('#address').fill('');
  await page.locator('#house-number').fill('123456');
  await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeDisabled();
  await page.locator('#house-number').fill('');
  await page.locator('#address').fill('J.P. Rizal Street');
  await page.screenshot({ path: 'tests/evidence/account/register-after-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  expect(input).toMatchObject({ suffix: 'Jr.', address_line: 'J.P. Rizal Street', password: 'Original123!' });
  expect(input).not.toHaveProperty('contact_number');
  await expect(page.getByRole('heading', { name: 'Confirm your email' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send a new code' })).toBeDisabled();
});

test('duplicate-registration error can resume verification without a second signup or password change', async ({ page, context }) => {
  await fixtures(context);
  let registrations = 0;
  let resends = 0;
  await context.route('**/api/auth/register', async (route) => {
    registrations++;
    await route.fulfill({ status: 409, json: { error: 'An account with that email already exists. Sign in instead.', details: { code: 'already_registered' } } });
  });
  await context.route('**/api/auth/resend-code', async (route) => {
    resends++;
    if (resends === 1) return route.fulfill({ status: 503, json: { error: 'A new code could not be sent. Try again in a few minutes.' } });
    return route.fulfill({ status: 204 });
  });
  await context.route('**/api/auth/verify-email', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ email: profile.email, token: '123456' });
    await route.fulfill({ json: { ...session(), user: { ...profile, residency_status: 'pending', has_residency_proof: false } } });
  });
  await page.goto('/register');
  await fillRegistration(page);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('already exists');
  await page.getByRole('button', { name: 'Already started? Continue email verification' }).click();
  await expect(page.getByText('Confirming your email is separate from residency review.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Send a new code' }).click();
  await expect(page.getByText('A new code could not be sent. Try again in a few minutes.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Send a new code' }).click();
  await expect(page.getByText('A new code was requested for', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send a new code' })).toBeDisabled();
  expect(registrations).toBe(1);
  expect(resends).toBe(2);
  await page.screenshot({ path: 'tests/evidence/account/email-resume-simulated.png', fullPage: true });
  await page.locator('#email-code').fill('123456');
  await page.getByRole('button', { name: 'Confirm email', exact: true }).click();
  await expect(page).toHaveURL(/register\?step=proof/);
});

test('account edit preserves legacy address when changing another detail and caps shared phone input', async ({ page, context }) => {
  await fixtures(context);
  let input: Record<string, unknown> | undefined;
  await context.route('**/api/auth/me', async (route) => {
    if (route.request().method() === 'PATCH') {
      input = route.request().postDataJSON();
      return route.fulfill({ json: { user: { ...profile, ...input } } });
    }
    return route.fulfill({ json: { user: profile } });
  });
  await login(page);
  await page.goto('/account');
  await page.getByRole('button', { name: 'Edit details' }).click();
  await expect(page.locator('#house-number')).toHaveValue('');
  await expect(page.locator('#address')).toHaveValue(profile.address_line);
  await page.locator('#contact').pressSequentially('09171234567890');
  await expect(page.locator('#contact')).toHaveValue('09171234567');
  await page.getByRole('button', { name: 'Save details' }).click();
  expect(input).toMatchObject({ address_line: profile.address_line, contact_number: '09171234567' });
});

test('administrator account creation uses shared phone cap and canonical suffix', async ({ page, context }) => {
  await fixtures(context);
  const admin = { ...profile, role: 'admin' };
  await context.route('**/api/auth/login', (route) => route.fulfill({ json: { ...session(), user: admin } }));
  await context.route('**/api/auth/me', (route) => route.fulfill({ json: { user: admin } }));
  let created: Record<string, unknown> | undefined;
  await context.route('**/api/admin/users', (route) => {
    if (route.request().method() === 'POST') {
      created = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: { user: admin } });
    }
    return route.fulfill({ json: { users: [] } });
  });
  await login(page);
  await page.goto('/admin/users');
  await page.getByRole('button', { name: 'New account', exact: true }).click();
  await page.locator('#new-contact').pressSequentially('09171234567890');
  await expect(page.locator('#new-contact')).toHaveValue('09171234567');
  await page.locator('#new-suffix').fill('iii');
  await expect(page.locator('#new-suffix')).toHaveValue('iii');
  await page.locator('#new-first-name').fill('Ana');
  await page.locator('#new-last-name').fill('Reyes');
  await page.locator('#new-email').fill('staff@kamoti.invalid');
  await page.locator('#new-password').fill('Original123!');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect.poll(() => created).toMatchObject({ suffix: 'III', contact_number: '09171234567' });
});

test('registration preserves PR 81 layout across narrow and desktop widths', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const width of [320, 375, 414, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/register');
    await expect(page.getByText('Fields marked with')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.getByRole('button', { name: 'Create account', exact: true }).evaluate((button) => getComputedStyle(button).justifyContent)).toBe('center');
    if (width === 375) await page.screenshot({ path: 'tests/evidence/account/register-after-mobile.png', fullPage: true });
    await page.goto('/signin');
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  }
  expect(errors).toEqual([]);
});

test('four tabs serialize refresh, share idle activity and sign out together', async ({ page, context }) => {
  await fixtures(context);
  let refreshes = 0;
  await context.route('**/api/auth/refresh', async (route) => {
    refreshes++;
    await new Promise((resolve) => setTimeout(resolve, 100));
    await route.fulfill({ json: { ...session(), access_token: `refreshed-${refreshes}` } });
  });
  await login(page);
  const tabs = [page];
  for (let i = 0; i < 3; i++) {
    const tab = await context.newPage();
    await tab.goto('/account');
    await expect(tab.getByRole('heading', { name: 'My account' })).toBeVisible();
    tabs.push(tab);
  }
  await Promise.all(tabs.map((tab) => tab.evaluate(async () => {
    const modulePath = '/lib/api.ts';
    const api = await import(modulePath);
    return api.refreshSession();
  })));
  expect(refreshes).toBe(1);
  for (const tab of tabs) expect(await tab.evaluate(() => localStorage.getItem('kamoti.token'))).toBe('refreshed-1');
  await page.evaluate(() => localStorage.setItem('kamoti.activity', String(Date.now() - 15 * 60_000 - 10_000)));
  for (const tab of tabs) await tab.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  for (const tab of tabs) await expect(tab.getByRole('button', { name: 'Stay signed in' })).toBeVisible();
  await tabs[1].getByRole('button', { name: 'Stay signed in' }).click();
  for (const tab of tabs) await tab.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  for (const tab of tabs) await expect(tab.getByRole('button', { name: 'Stay signed in' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  for (const tab of tabs) {
    await expect(tab.getByRole('link', { name: 'Sign in', exact: true }).first()).toBeVisible();
    expect(await tab.evaluate(() => localStorage.getItem('kamoti.token'))).toBeNull();
  }
});

test('password recovery retains generic resend copy and centered actions', async ({ page, context }) => {
  await fixtures(context);
  await context.route('**/api/auth/forgot-password', (route) => route.fulfill({ status: 204 }));
  await page.goto('/signin?step=reset');
  await page.locator('#reset-email').fill(profile.email);
  const send = page.getByRole('button', { name: 'Send reset code' });
  expect(await send.evaluate((button) => getComputedStyle(button).justifyContent)).toBe('center');
  await send.click();
  await expect(page.getByRole('button', { name: 'Change password' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Send a new code' })).toBeDisabled();
  expect(await page.getByRole('button', { name: 'Change password' }).evaluate((button) => getComputedStyle(button).justifyContent)).toBe('center');
});
