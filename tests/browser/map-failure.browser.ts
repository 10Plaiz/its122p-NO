import { expect, test } from "@playwright/test";

test("The board keeps its reports when Maps refuses authentication", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/board");
  await expect(page.getByRole("heading", { name: "Public transparency board" })).toBeVisible();
  test.skip(await page.getByText("This copy of KAMOTI has no Google Maps key", { exact: false }).count() > 0,
    "This authentication case requires a configured Maps key.");

  // Google calls this global callback when it rejects the site's key.
  await page.evaluate(() => {
    const onFailure: unknown = Reflect.get(window, "gm_authFailure");
    if (typeof onFailure === "function") onFailure();
  });

  await expect(page.getByTestId("map-unavailable")).toContainText("Google Maps refused this site's key");
  await expect(page.locator(".card").first()).toBeVisible();
  await page.locator("#status").selectOption("in_progress");
  await expect(page).toHaveURL(/status=in_progress/);
  await expect(page.locator(".card").first()).toBeVisible();

  await page.getByRole("link", { name: "KAMOTI", exact: true }).click();
  await page.getByRole("link", { name: "Browse the public board", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Public transparency board" })).toBeVisible();
  await expect(page.getByTestId("map-unavailable")).toContainText("Google Maps refused this site's key");
  await expect(page.locator(".card").first()).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByTestId("mobile-view-map").click();
  await expect(page.getByRole("radio", { name: "Map View", exact: true })).toBeChecked();
  await expect(page.getByTestId("map-unavailable")).toBeVisible();
  await page.getByTestId("mobile-view-list").click();
  await expect(page.getByRole("radio", { name: "List View", exact: true })).toBeChecked();
  await expect(page.locator(".card").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("The board keeps its reports when the Maps script is blocked", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://maps.googleapis.com/maps/api/js*", (route) => route.abort());
  await page.goto("/board");
  await expect(page.getByRole("heading", { name: "Public transparency board" })).toBeVisible();
  test.skip(await page.getByText("This copy of KAMOTI has no Google Maps key", { exact: false }).count() > 0,
    "This network-failure case requires a configured Maps key.");
  await expect(page.getByTestId("map-unavailable")).toContainText("Google Maps did not load");
  await expect(page.locator(".card").first()).toBeVisible();
  await page.locator("#status").selectOption("in_progress");
  await expect(page).toHaveURL(/status=in_progress/);
  await expect(page.locator(".card").first()).toBeVisible();
  expect(errors).toEqual([]);
});
