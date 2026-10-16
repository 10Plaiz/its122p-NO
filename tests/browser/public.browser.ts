import { test, expect } from "@playwright/test";
import { STUDENT_PROJECT_NOTICE } from "../../src/web/lib/site-notice.js";
import { captureEvidence } from "./helpers.js";

test.describe("Public Community Board (FUNC-08)", () => {
  test("FUNC-08: Public board displays reviewed reports and captures evidence", async ({ page }) => {
    await page.goto("/board");
    await page.waitForLoadState("networkidle");

    // Board title and controls
    await expect(page.locator("h2, h1")).toContainText("Public transparency board");

    // Capture evidence of the public community board
    await captureEvidence(page, "FUNC-08-public-board.png");
  });
});

// #74: anyone can sign up on the live site, so it says it is a student project.
test.describe("Student project notice (#74)", () => {
  test("#74: every page's footer and the sign-up form say KAMOTI is a student project", async ({ page }) => {
    await page.goto("/board");
    await expect(page.locator("footer")).toContainText(STUDENT_PROJECT_NOTICE);

    await page.goto("/register");
    const notice = page.locator("#student-project-notice");
    await expect(notice).toHaveText(STUDENT_PROJECT_NOTICE);
    // Read before the consent it sits above.
    const noticeBox = await notice.boundingBox();
    const consentBox = await page.locator("#consent").boundingBox();
    expect(noticeBox && consentBox && noticeBox.y < consentBox.y).toBe(true);
    await captureEvidence(page, "74-register-notice.png");
  });
});

// UA-9: a guest left idle is warned, then returned to the start, which clears a
// half-filled form on a shared computer.
test.describe("Guest idle reset (UA-9)", () => {
  test("UA-9: an idle guest can stay, and is later returned to the start with the form cleared", async ({ page }) => {
    await page.clock.install();
    await page.goto("/register");
    await page.locator("#first-name").fill("Idle Guest");

    await page.clock.runFor(61_000);
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("no activity for 1 minute.");
    await page.getByRole("button", { name: "Stay here", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("#first-name")).toHaveValue("Idle Guest");

    await page.clock.runFor(122_000);
    await expect(page).toHaveURL(/\/$/);
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("#first-name")).toHaveCount(0);

    // Left on the start page, the guest is not warned again until they come back.
    await page.clock.runFor(180_000);
    await expect(dialog).toHaveCount(0);
  });
});
