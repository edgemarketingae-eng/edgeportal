import { expect, test } from "@playwright/test";
import { E2E } from "../config";
import { crmSignIn } from "./helpers";

const uniq = Date.now().toString().slice(-7);

test("dropdowns work from the keyboard and post with their form", async ({ page }) => {
  await crmSignIn(page, "crm-admin@edgeacademy.local");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`${E2E.crm}/leads/new`);
  await page.getByLabel("Name", { exact: true }).fill(`E2E Keys ${uniq}`);
  await page.getByLabel("Mobile (WhatsApp)").fill(`+97155${uniq}`);

  // A long list opens on its search box: arrow down, type, Enter.
  const source = page.getByLabel("Source", { exact: true }).filter({ visible: true });
  await source.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("combobox", { name: "Search source" })).toBeFocused();
  await page.keyboard.type("refer");
  await page.keyboard.press("Enter");
  await expect(source).toHaveText("Referral");
  await expect(page.getByRole("listbox")).toHaveCount(0);

  // A short list has no search box: typing jumps to the option.
  const temperature = page.getByLabel("Temperature", { exact: true }).filter({ visible: true });
  await temperature.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("c");
  await page.keyboard.press("Enter");
  await expect(temperature).toHaveText("Cold");

  await page.getByRole("button", { name: "Create lead" }).click();
  await expect(page.getByText("Lead created.")).toBeVisible();
  await expect(page.getByText("Referral").first()).toBeVisible();
  await expect(page.getByText("Cold", { exact: true }).first()).toBeVisible();
});

test("a set filter keeps its name, and Clear filters goes back to the full list", async ({ page }) => {
  await crmSignIn(page, "crm-admin@edgeacademy.local");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`${E2E.crm}/leads`);
  const clear = page.getByRole("button", { name: "Clear filters" });
  await expect(clear).toBeHidden();

  await page.goto(`${E2E.crm}/leads?stage=CONTACTED`);
  await expect(page.getByLabel("Stage", { exact: true })).toHaveText("Stage: Contacted");
  await clear.click();
  await expect(page).toHaveURL(/\/leads$/);
  await expect(page.getByLabel("Stage", { exact: true })).toHaveText("Stage: all");
  await expect(clear).toBeHidden();
});

test("on a phone, a dropdown opens as a bottom sheet", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await crmSignIn(page, "crm-admin@edgeacademy.local");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`${E2E.crm}/leads/new`);
  const source = page.getByLabel("Source", { exact: true }).filter({ visible: true });
  await source.tap();
  const sheet = page.getByRole("dialog", { name: "Source" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("option", { name: "Webinar" }).tap();
  await expect(sheet).toBeHidden();
  await expect(source).toHaveText("Webinar");
  await context.close();
});

test("disabling an account asks first", async ({ page }) => {
  await crmSignIn(page, "crm-admin@edgeacademy.local");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`${E2E.crm}/team`);
  await page.getByRole("link", { name: "Sales Desk" }).click();
  await expect(page).toHaveURL(/\/team\/[a-f0-9]{24}/);
  await page.getByRole("button", { name: "Disable account" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Disable Sales Desk's account?")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Disable account" })).toBeVisible();
});
