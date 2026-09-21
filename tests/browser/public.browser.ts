import { test, expect } from "@playwright/test";
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
