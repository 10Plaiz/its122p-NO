import { test, expect, type Page } from '@playwright/test';
import type { Profile, Report } from '../../src/web/lib/types.js';

// Controlled API responses: these scenarios exercise the real UI without database writes.
const citizen: Profile = { id: 'simulated-citizen', name: 'Example Resident', email: 'resident@kamoti.invalid', role: 'citizen', residency_status: 'verified', residency_review_version: '1', residency_proof_id: null, is_active: true };
const report: Report = {
  id: 'simulated-report', reference_code: 'KMT-2026-000123', title: 'Damaged sidewalk near crossing',
  description: 'The sidewalk has a broken section beside the crossing.', status: 'pending',
  latitude: 14.5547, longitude: 121.0244, address_text: null, is_public: false,
  submitted_at: '2026-10-16T00:00:00Z', updated_at: '2026-10-16T00:00:00Z', resolved_at: null,
  barangay: 'San Lorenzo', assigned_at: null, status_changed_at: '2026-10-16T00:00:00Z',
  closure_requested_at: null, closure_outcome: null, closure_reason: null, verified_at: null,
  category: {id: 1, name: 'Road'}, primary_problem: {id: 1, name: 'Broken pavement'}, secondary_problem: null,
  citizen, assigned_staff: null, photos: [],
};
const evidence = 'tests/evidence/website-submission';
const baseline = process.env.SUBMISSION_BASELINE === '1';
const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({page}) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
});
test.afterEach(({page}) => {
  expect(pageErrors.get(page)).toEqual([]);
});

async function prepare(page: Page, mapFailure = false) {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: report.latitude, longitude: report.longitude });
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body: unknown;
    if (path === '/api/auth/login') body = { user: citizen, access_token: 'simulated-token', expires_at: Math.floor(Date.now()/1000)+3600 };
    else if (path === '/api/auth/me') body = { user: citizen };
    else if (path === '/api/categories') body = {categories: ['Road','Streetlight','Drainage','Sign'].map((name,i)=>({id:i+1,name,is_active:true,description:null}))};
    else if (path === '/api/reports/meta/problem-types') body = {groups: [{category_id:1, problem_types:[{id:1,name:'Broken pavement'},{id:2,name:'Other damage'}]}]};
    else if (path.endsWith('/updates')) body = {updates: []};
    else if (path === '/api/reports' && route.request().method() === 'POST') body = {report};
    else if (path === '/api/reports/simulated-report') body = {report};
    else if (path.includes('notifications')) body = {notifications:[],unread_count:0,total:0};
    else body = {reports:[],total:0,stats:{}};
    await route.fulfill({json:body});
  });
  await page.route('https://nominatim.openstreetmap.org/**', route => route.fulfill({json:{}}));
  if (mapFailure) await page.route('https://maps.googleapis.com/**', route => route.abort());
  await page.goto('/signin');
  await page.locator('#email').fill(citizen.email);
  await page.locator('#password').fill('SimulatedPassword123!');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.waitForURL('**/my-reports');
  await page.getByRole('link',{name:'Report an issue',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Where is it?'})).toBeVisible();
}

async function gps(page: Page) {
  await page.getByRole('button',{name:'Use my location',exact:true}).click();
  await expect(page.getByRole('button',{name:'Confirm location',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Confirm location',exact:true}).click();
  await expect(page.getByTestId('selected-coordinates')).toContainText('14.55470');
}

test('baseline: GPS immediately selects location without confirmation', async ({page}) => {
  test.skip(!baseline);
  await page.setViewportSize({width:1280,height:900});
  await prepare(page);
  await page.getByRole('button',{name:'Use my location',exact:true}).click();
  await expect(page.getByTestId('selected-coordinates')).toContainText('14.55470');
  await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeEnabled();
  await page.screenshot({path:`${evidence}/before-desktop-location.png`,fullPage:true});
});

test('simulated submission: explicit confirmation, required fields and one acknowledgement', async ({page}) => {
  test.skip(baseline);
  await page.setViewportSize({width:1280,height:900});
  await prepare(page);
  await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeDisabled();
  await gps(page);
  await page.screenshot({path:`${evidence}/after-desktop-location.png`,fullPage:true});
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(page.locator('#category')).toHaveAttribute('required','');
  await expect(page.locator('#category option')).toHaveText(['Choose a category','Road','Streetlight','Drainage','Sign']);
  await page.locator('#category').selectOption('1');
  await page.locator('#primary-problem').selectOption('1');
  await page.locator('#title').fill(report.title);
  await page.locator('#description').fill(report.description);
  for (const id of ['category','primary-problem','title','description']) {
    await expect(page.locator(`label[for="${id}"]`)).toContainText('(required)');
    await expect(page.locator(`#${id}`)).toHaveAttribute('required','');
  }
  await expect(page.locator('#secondary-problem')).not.toHaveAttribute('required','');
  await page.setViewportSize({width:375,height:812});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:`${evidence}/after-mobile-required-fields.png`,fullPage:true});
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:'Submit report',exact:true}).click();
  await page.waitForURL('**/reports/simulated-report');
  const acknowledgement = page.getByText('Your report has been submitted and is awaiting review.',{exact:false});
  await expect(acknowledgement).toHaveCount(1);
  await expect(acknowledgement).toContainText(report.reference_code);
  await expect(page.getByText('Pending',{exact:true})).toBeVisible();
  await page.screenshot({path:`${evidence}/after-mobile-submitted.png`,fullPage:true});
  await page.reload();
  await expect(page.getByRole('heading',{name:report.title})).toBeVisible();
  await expect(acknowledgement).toHaveCount(0);
});

test('simulated map failure: GPS requires confirmation, outside Makati is refused; edit uses same picker', async ({page}) => {
  test.skip(baseline);
  await page.setViewportSize({width:320,height:812});
  await prepare(page,true);
  await expect(page.getByTestId('map-unavailable')).toBeVisible();
  await page.getByRole('button',{name:'Use my location',exact:true}).click();
  await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeDisabled();
  await gps(page);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.context().setGeolocation({latitude:14.45,longitude:120.98});
  await page.getByRole('button',{name:'Use my location',exact:true}).click();
  await expect(page.getByText(/The pin is outside Makati/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeDisabled();
  page.on('dialog', dialog=>dialog.accept());
  await page.goto('/reports/simulated-report');
  await page.getByRole('button',{name:'Edit report',exact:true}).click();
  await page.locator('#edit-title').fill('Changed sidewalk report title');
  await expect(page.getByRole('button',{name:'Save changes',exact:true})).toBeEnabled();
  await page.context().setGeolocation({latitude:14.555,longitude:121.025});
  await page.getByRole('button',{name:'Use my location',exact:true}).click();
  await expect(page.getByRole('button',{name:'Save changes',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Confirm location',exact:true}).click();
  await expect(page.getByRole('button',{name:'Save changes',exact:true})).toBeEnabled();
});

// The real picker receives camera/Places events from a deterministic test adapter.
// This proves application state handling, not Google service rendering or delivery.
test('simulated map adapter: center pin, keyboard movement, search, GPS and edit re-centering', async ({page}) => {
  test.skip(baseline);
  await page.route('**/lib/maps.ts*', async route => {
    const response = await route.fetch();
    const source = (await response.text()).replace(/function googleMapsApiKey\(\) \{[\s\S]*?\n\}/, 'function googleMapsApiKey() { return "simulated-key"; }');
    await route.fulfill({response,body:source});
  });
  await page.route('**/node_modules/.vite/deps/@vis__gl_react-google-maps.js*', async route => {
    const { readFile } = await import('node:fs/promises');
    const main = await page.request.get('/main.tsx');
    const reactUrl = (await main.text()).match(/from "([^"]+\/react.js[^"]*)"/)?.[1];
    if (!reactUrl) throw new Error('Vite React module was not found');
    const adapter = (await readFile('tests/browser/fixtures/submission-maps.mjs','utf8')).replace('__REACT_URL__', reactUrl);
    await route.fulfill({contentType:'text/javascript',body:adapter});
  });
  await prepare(page);
  const map = page.getByRole('region',{name:'Simulated map',exact:true});
  await expect(map).toBeVisible();
  for (const width of [414, 768, 1280]) {
    await page.setViewportSize({width,height:900});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeDisabled();
  const pinOffset = () => page.getByTestId('map-center-pin').evaluate(pin => {
    const a = pin.getBoundingClientRect();
    const b = pin.parentElement?.getBoundingClientRect();
    return b ? {x:a.x-b.x,y:a.y-b.y} : null;
  });
  const pinBefore = await pinOffset();
  await page.getByRole('button',{name:'Confirm location',exact:true}).click();
  await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeEnabled();
  await map.press('ArrowRight');
  await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeDisabled();
  expect(await pinOffset()).toEqual(pinBefore);
  await page.getByRole('button',{name:'Confirm location',exact:true}).click();
  await page.getByRole('button',{name:'Simulated search result',exact:true}).click();
  await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Confirm location',exact:true}).click();
  await expect(page.getByTestId('selected-coordinates')).toContainText('14.55500, 121.02500');
  await gps(page);
  await page.getByRole('button',{name:'Simulate Places failure',exact:true}).click();
  await expect(page.getByText('Place search is unavailable.',{exact:false})).toBeVisible();
  await map.press('ArrowRight');
  await page.getByRole('button',{name:'Confirm location',exact:true}).click();
  page.on('dialog',dialog=>dialog.accept());
  await page.goto('/reports/simulated-report');
  await page.getByRole('button',{name:'Edit report',exact:true}).click();
  await expect(page.getByRole('button',{name:'Location confirmed',exact:true})).toBeVisible();
  await expect(page.getByText('14.55470, 121.02440',{exact:true})).toBeVisible();
  await page.locator('#edit-title').fill('Updated title');
  await expect(page.getByRole('button',{name:'Save changes',exact:true})).toBeEnabled();
  await map.press('ArrowRight');
  await expect(page.getByRole('button',{name:'Save changes',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Confirm location',exact:true}).click();
  await expect(page.getByRole('button',{name:'Save changes',exact:true})).toBeEnabled();
});

