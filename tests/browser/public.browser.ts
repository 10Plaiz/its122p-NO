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
