import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { signIn, USERS } from "./helpers.js";

async function textContrast(locator: Locator, placeholder = false) {
  return locator.evaluate((element, placeholder) => {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const layer = document.createElement("canvas");
    layer.width = 2;
    layer.height = 1;
    const paint = layer.getContext("2d", { willReadFrequently: true });
    if (!context || !paint) throw new Error("The browser cannot measure rendered colors.");

    const style = getComputedStyle(element, placeholder ? "::placeholder" : null);
    context.globalAlpha = placeholder ? Number(style.opacity) : 1;
    context.fillStyle = style.color;
    context.fillRect(1, 0, 1, 1);

    // One pixel holds the background; the other includes the text color.
    // Compose each ancestor as a group so parent opacity affects both pixels.
    for (let current: Element | null = element; current; current = current.parentElement) {
      const ancestor = getComputedStyle(current);
      paint.clearRect(0, 0, 2, 1);
      paint.fillStyle = ancestor.backgroundColor;
      paint.fillRect(0, 0, 2, 1);
      paint.drawImage(canvas, 0, 0);
      context.clearRect(0, 0, 2, 1);
      context.globalAlpha = Number(ancestor.opacity);
      context.drawImage(layer, 0, 0);
    }
    paint.fillStyle = "white";
    paint.fillRect(0, 0, 2, 1);
    paint.drawImage(canvas, 0, 0);
    const background = Array.from(paint.getImageData(0, 0, 1, 1).data).slice(0, 3);
    const foreground = Array.from(paint.getImageData(1, 0, 1, 1).data).slice(0, 3);

    function luminance(rgb: number[]) {
      const [red, green, blue] = rgb.map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return red * 0.2126 + green * 0.7152 + blue * 0.0722;
    }
    const front = luminance(foreground);
    const back = luminance(background);
    return { ratio: (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05), foreground, background };
  }, placeholder);
}

test("Routine actions and supporting copy meet ordinary text contrast", async ({ page }) => {
  await page.goto("/");
  const action = page.getByRole("link", { name: "Report an issue", exact: true });
  await expect(action).toBeVisible();

  const primary = await textContrast(action);
  expect(primary.ratio).toBeGreaterThanOrEqual(4.5);
  expect(primary.background[1]).toBeGreaterThan(primary.background[0]);
  expect(primary.background[2]).toBeGreaterThan(primary.background[0]);
  expect((await textContrast(page.locator("main p.text-muted").first())).ratio).toBeGreaterThanOrEqual(4.5);

  await action.hover();
  expect((await textContrast(action)).ratio).toBeGreaterThanOrEqual(4.5);
});

test("Invalid fields use readable red feedback while hints remain readable", async ({ page }) => {
  await page.goto("/register");
  const email = page.getByRole("textbox", { name: "Email", exact: true });
  await email.fill("invalid-address");
  await email.blur();
  await expect(email).toHaveAttribute("aria-invalid", "true");

  const error = page.locator("#email-note");
  await expect(error).toHaveAttribute("role", "alert");
  const feedback = await textContrast(error);
  expect(feedback.ratio).toBeGreaterThanOrEqual(4.5);
  expect(feedback.foreground[0]).toBeGreaterThan(feedback.foreground[1] * 2);
  expect(feedback.foreground[0]).toBeGreaterThan(feedback.foreground[2] * 2);
  expect((await textContrast(page.locator("#middle-name-note"))).ratio).toBeGreaterThanOrEqual(4.5);

  await page.goto("/board");
  expect((await textContrast(page.getByRole("searchbox"), true)).ratio).toBeGreaterThanOrEqual(4.5);
});

test("Admin dialogs remain readable and wide tables stay inside the page", async ({ page }) => {
  await signIn(page, process.env.UI_AUDIT_ADMIN_EMAIL ?? USERS.admin);
  await page.goto("/admin/reports");
  await page.getByRole("button", { name: /^Assign/ }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect((await textContrast(dialog.locator("p.text-muted").first())).ratio).toBeGreaterThanOrEqual(4.5);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  for (const path of ["/admin/reports", "/admin/users"]) {
    for (const width of [320, 375, 414, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await expect(page.locator("table")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
  }

  await page.goto("/admin/categories");
  await page.getByRole("button", { name: "Retire", exact: true }).first().click();
  const confirm = page.getByRole("button", { name: "Yes, retire", exact: true });
  const danger = await textContrast(confirm);
  expect(danger.ratio).toBeGreaterThanOrEqual(4.5);
  expect(danger.background[0]).toBeGreaterThan(danger.background[1] * 2);
  await page.getByRole("button", { name: "Keep it", exact: true }).click();
  await expect(confirm).toBeHidden();
});
