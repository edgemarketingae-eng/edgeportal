import { expect, test, type Page } from "@playwright/test";
import { E2E } from "../config";

async function checkShowPassword(page: Page, url: string) {
  await page.goto(url);
  const field = page.locator('input[name="password"]');
  await field.fill("Sup3rSecret!");
  await expect(field).toHaveAttribute("type", "password");

  await page.getByRole("button", { name: "Show password" }).click();
  await expect(field).toHaveAttribute("type", "text");
  await expect(field).toHaveValue("Sup3rSecret!");
  await expect(page).toHaveURL(url); // the button mustn't submit the form

  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(field).toHaveAttribute("type", "password");
  await expect(field).toHaveValue("Sup3rSecret!");
}

for (const [app, url] of [
  ["student portal", E2E.student],
  ["staff console", E2E.console],
  ["CRM", E2E.crm],
] as const) {
  test(`the ${app} sign-in can show the typed password`, ({ page }) => checkShowPassword(page, `${url}/login`));
}

test("student sign-up can show the typed password", ({ page }) => checkShowPassword(page, `${E2E.student}/signup`));
