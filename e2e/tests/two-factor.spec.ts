import { expect, test } from "@playwright/test";
import { E2E } from "../config";
import { staffSignIn, totp } from "./helpers";

test("staff member turns on two-factor and signs in with an authenticator code", async ({ page }) => {
  await staffSignIn(page, "finance@edgeacademy.local");
  await expect(page).toHaveURL(/\/admin/);
  await page.goto(`${E2E.console}/security`);
  await page.locator('input[name="password"]').fill(E2E.staffPassword);
  await page.getByRole("button", { name: "Set up authenticator app" }).click();
  const secret = (await page.getByTestId("totp-secret").textContent())!.trim();
  await page.locator('input[name="code"]').fill(totp(secret));
  await page.getByRole("button", { name: "Turn on two-factor" }).click();
  await expect(page).toHaveURL(/\/admin/);

  await page.context().clearCookies();
  await staffSignIn(page, "finance@edgeacademy.local");
  await expect(page).toHaveURL(/two-factor/);
  // A fresh time step, so the code differs from the one used during setup.
  await page.waitForTimeout(30_000 - (Date.now() % 30_000) + 500);
  await page.locator('input[name="code"]').fill(totp(secret));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/admin/);

  // Clean up so the demo account stays usable when the stack is reused.
  await page.goto(`${E2E.console}/security`);
  await page.locator('input[name="password"]').fill(E2E.staffPassword);
  await page.getByRole("button", { name: "Turn off two-factor" }).click();
  await expect(page.getByText("Two-factor authentication is off.")).toBeVisible();
});

test("a mentor cannot open the admin panel", async ({ page }) => {
  await staffSignIn(page, "mentor@edgeacademy.local");
  await expect(page).toHaveURL(/\/staff$/);
  await page.goto(`${E2E.console}/admin`);
  await expect(page).toHaveURL(/\/staff\?error=forbidden/);
});
