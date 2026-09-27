import { chromium } from "@playwright/test";
import * as fs from "node:fs";

const EVIDENCE_DIR = "tests/evidence";
const PRESENTATION_PASSWORD = "Km!_HzdrZj-p6ciRmy-VyTrLwImMa9KZFe8";
const DEPLOYED_URL = "https://kamoti-chi.vercel.app";
const LOCAL_URL = "http://localhost:5173";

const mode = process.argv[2] ?? "before";
const baseUrl = mode === "before" ? DEPLOYED_URL : LOCAL_URL;
const suffix = `-${mode}.png`;

async function main() {
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Sign in as Presentation Staff 1 (Mariel Dela Cruz) who has 50 unread notifications
  console.log(`Signing in as demo-makati-staff-1@kamoti.invalid on ${baseUrl} (${mode})...`);
  await page.goto(`${baseUrl}/signin`);
  await page.fill("#email", "demo-makati-staff-1@kamoti.invalid");
  await page.fill("#password", PRESENTATION_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForLoadState("networkidle");

  // Navigate to /notifications
  console.log("Navigating to /notifications...");
  await page.goto(`${baseUrl}/notifications`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);

  if (mode === "after") {
    // Click "Mark read" on the first notification to verify read state bottom-right anchor
    const firstMarkRead = page.locator('button:has-text("Mark read")').first();
    if (await firstMarkRead.isVisible()) {
      console.log("Marking first notification as read to test read-state anchor...");
      await firstMarkRead.click();
      await page.waitForTimeout(1000);
    }
  }

  // Desktop (1280x800)
  await page.setViewportSize({ width: 1280, height: 800 });
  const desktopPath = `${EVIDENCE_DIR}/NOTIFS-feed-desktop${suffix}`;
  await page.screenshot({ path: desktopPath, fullPage: true });
  console.log(`Saved ${desktopPath}`);

  // Mobile (375x812)
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(500);
  const mobilePath = `${EVIDENCE_DIR}/NOTIFS-feed-mobile${suffix}`;
  await page.screenshot({ path: mobilePath, fullPage: true });
  console.log(`Saved ${mobilePath}`);

  await browser.close();
  console.log(`Done capturing notifications ${mode} screenshots!`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
