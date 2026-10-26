import { expect, test } from "@playwright/test";
import { E2E } from "../config";
import { crmSignIn } from "./helpers";

/**
 * CRM team availability and the lead dialogs: the admin marks a sales executive Off and back on; quick add works on
 * a short phone screen (the dialog body scrolls, the footer stays reachable); the lead page edits in a wide dialog.
 */
test.describe.configure({ mode: "serial" });

const uniq = Date.now().toString().slice(-7);
const lead = { name: `Dialog Lead ${uniq}`, phone: `52${uniq}`, email: `dialog.${uniq}@example.com` };

test("1. the CRM admin marks a sales executive Off and back on from the team list", async ({ page }) => {
  await crmSignIn(page, "crm-admin@edgeacademy.local");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`${E2E.crm}/team`);
  const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: "Sales Desk", exact: true }) });
  const toggle = row.getByRole("switch", { name: "Sales Desk: receiving leads" });
  await expect(toggle).toBeChecked();

  await toggle.click();
  await expect(page.getByText("Marked Off: no new leads until they're back.")).toBeVisible();
  await expect(row.getByText("Off", { exact: true })).toBeVisible();
  await expect(toggle).not.toBeChecked();

  await toggle.click();
  await expect(page.getByText("Back on: receiving leads again.")).toBeVisible();
  await expect(row.getByText("Off", { exact: true })).toHaveCount(0);
});

test("2. quick add fits a short phone screen: the form scrolls and the Add button stays reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await crmSignIn(page, "crm-admin@edgeacademy.local");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`${E2E.crm}/leads`);
  await page.getByRole("button", { name: "Quick add" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Quick add lead" })).toBeInViewport();
  await expect(dialog.getByRole("button", { name: "Add lead" })).toBeInViewport();
  const box = (await dialog.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(640);

  await dialog.getByLabel("Name", { exact: true }).fill(lead.name);
  await dialog.getByLabel("Mobile (WhatsApp)").fill(lead.phone);
  await dialog.getByLabel("Notes").scrollIntoViewIfNeeded();
  await dialog.getByRole("button", { name: "Add lead" }).click();
  await expect(page.getByText(`${lead.name} added.`)).toBeVisible();
  await expect(dialog).toBeHidden();
});

test("3. the lead page edits in a wide dialog with a usable phone field", async ({ page }) => {
  await crmSignIn(page, "crm-admin@edgeacademy.local");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`${E2E.crm}/leads?q=${encodeURIComponent(lead.name)}&view=all`);
  await page.getByRole("link", { name: lead.name }).first().click();
  await expect(page).toHaveURL(/\/leads\/[a-f0-9]{24}/);

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Edit lead" })).toBeVisible();
  expect((await dialog.boundingBox())!.width).toBeGreaterThan(800);
  expect((await dialog.getByLabel("Mobile (WhatsApp)").boundingBox())!.width).toBeGreaterThan(150);

  await dialog.getByLabel("Email", { exact: true }).fill(lead.email);
  await dialog.getByRole("button", { name: "Save lead" }).click();
  await expect(page.getByText("Lead saved.")).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(lead.email).first()).toBeVisible();
});
