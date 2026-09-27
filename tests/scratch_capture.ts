import { chromium } from "@playwright/test";
import * as path from "node:path";
import * as fs from "node:fs";

const EVIDENCE_DIR = "tests/evidence";
const PRESENTATION_PASSWORD = "Km!_HzdrZj-p6ciRmy-VyTrLwImMa9KZFe8";
const DEPLOYED_URL = "https://kamoti-chi.vercel.app";
const LOCAL_URL = "http://localhost:5173";

// Determine mode ('before' or 'after')
const mode = process.argv[2] ?? "after";
const baseUrl = mode === "before" ? DEPLOYED_URL : LOCAL_URL;
const suffix = `-${mode}.png`;

console.log(`\n=== Running Capture Mode: [${mode.toUpperCase()}] against ${baseUrl} ===\n`);

async function main() {
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // 1. Sign in as Presentation Staff 1 (Mariel Dela Cruz)
  console.log(`Signing in as demo-makati-staff-1@kamoti.invalid on ${baseUrl}...`);
  await page.goto(`${baseUrl}/signin`);
  await page.fill("#email", "demo-makati-staff-1@kamoti.invalid");
  await page.fill("#password", PRESENTATION_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForLoadState("networkidle");

  // 2. Go to staff queue and pick first assigned report
  console.log("Navigating to staff queue...");
  await page.goto(`${baseUrl}/staff/queue`);
  await page.waitForLoadState("networkidle");

  const reportLink = page.locator("table tbody tr td a").first();
  const reportHref = await reportLink.getAttribute("href");
  console.log(`Found staff report href: ${reportHref}`);

  // Capture Staff Active Report at Desktop (1280x800)
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${baseUrl}${reportHref}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  const desktopPath = `${EVIDENCE_DIR}/REPORTS-staff-inspection-desktop${suffix}`;
  await page.screenshot({ path: desktopPath, fullPage: true });
  console.log(`Saved ${desktopPath}`);

  // Mobile (375x812)
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(500);
  const mobilePath = `${EVIDENCE_DIR}/REPORTS-staff-inspection-mobile${suffix}`;
  await page.screenshot({ path: mobilePath, fullPage: true });
  console.log(`Saved ${mobilePath}`);

  // Tablet (768x1024)
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(500);
  const tabletPath = `${EVIDENCE_DIR}/REPORTS-staff-inspection-tablet${suffix}`;
  await page.screenshot({ path: tabletPath, fullPage: true });
  console.log(`Saved ${tabletPath}`);

  // 3. Sign in as Presentation Admin (Nina Valdez) to view a resolved report with full history & photos
  console.log("Signing in as demo-makati-admin@kamoti.invalid...");
  await page.goto(`${baseUrl}/signin`);
  await page.fill("#email", "demo-makati-admin@kamoti.invalid");
  await page.fill("#password", PRESENTATION_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForLoadState("networkidle");

  // View resolved report with 2 photos (66b206ef-37bc-5206-abaa-6fca2ca3e3d1)
  console.log("Opening resolved report with photos...");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${baseUrl}/staff/reports/66b206ef-37bc-5206-abaa-6fca2ca3e3d1`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  const resolvedDesktopPath = `${EVIDENCE_DIR}/REPORTS-resolved-photos-desktop${suffix}`;
  await page.screenshot({ path: resolvedDesktopPath, fullPage: true });
  console.log(`Saved ${resolvedDesktopPath}`);

  // Also capture mobile for the resolved report with photos
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(500);
  const resolvedMobilePath = `${EVIDENCE_DIR}/REPORTS-resolved-photos-mobile${suffix}`;
  await page.screenshot({ path: resolvedMobilePath, fullPage: true });
  console.log(`Saved ${resolvedMobilePath}`);

  await browser.close();
  console.log(`\n=== Finished [${mode.toUpperCase()}] captures! ===\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
