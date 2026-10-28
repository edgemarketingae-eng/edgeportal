import { expect, test } from "@playwright/test";
import { E2E } from "../config";
import { crmSignIn } from "./helpers";

/**
 * Sales journey: the sales desk creates a lead with the language dropdown, a JetaFX client ID and a qualification
 * answer, marks it converted to Inner Circle and logs its 1st JetaFX deposit -> the CRM admin sets the commission
 * rates and verifies the deposit -> the commission shows on the deposit, the team page and the leaderboard.
 */
test.describe.configure({ mode: "serial" });

const uniq = Date.now().toString().slice(-7);
const lead = { name: `E2E Depositor ${uniq}`, phone: `+97156${uniq}`, jetaFx: `JX-${uniq}` };
let leadUrl = "";

test("1. a sales executive qualifies a lead, marks a conversion and logs a deposit", async ({ page }) => {
  await crmSignIn(page, "sales@edgeacademy.local");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("link", { name: "Products" })).toHaveCount(0); // no crm.manage

  await page.goto(`${E2E.crm}/leads/new`);
  await page.getByLabel("Name", { exact: true }).fill(lead.name);
  await page.getByLabel("Mobile (WhatsApp)").fill(lead.phone);
  await page.getByLabel("Language").selectOption({ label: "Malayalam" });
  await page.getByLabel("JetaFX client ID").fill(lead.jetaFx);
  await page.getByLabel("Trading experience and capital").fill("6 months on demo, can start with $1,000");
  await page.getByRole("button", { name: "Create lead" }).click();
  await expect(page).toHaveURL(/\/leads\/[a-f0-9]{24}/);
  await expect(page.getByText("Lead created.")).toBeVisible();
  leadUrl = page.url();
  await expect(page.getByText(/· Malayalam/)).toBeVisible();
  await expect(page.getByText(lead.jetaFx)).toBeVisible();
  // Visible only: the new-lead page stays mounted (hidden) after the redirect, with the same field labels.
  await expect(page.getByLabel("Trading experience and capital").filter({ visible: true })).toHaveValue(
    "6 months on demo, can start with $1,000",
  );

  await page.getByLabel("Purpose of learning trading").filter({ visible: true }).fill("A second income");
  await page.getByRole("button", { name: "Save answers" }).click();
  await expect(page.getByText("Answers saved.")).toBeVisible();

  await page.getByRole("button", { name: "Conversion", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Inner Circle").check();
  await page.getByRole("dialog").getByRole("button", { name: "Mark converted" }).click();
  await expect(page.getByText("Conversion marked.")).toBeVisible();
  await expect(page.getByText("Converted to Inner Circle")).toBeVisible();

  await page.getByRole("button", { name: "Deposit", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(lead.jetaFx)).toBeVisible(); // taken from the lead, not asked again
  await dialog.getByLabel("Amount (USD)").fill("1000");
  await dialog.getByRole("button", { name: "Log deposit" }).click();
  await expect(page.getByText(/Deposit logged/)).toBeVisible();
  await expect(page.getByText("USD 1,000.00").first()).toBeVisible();
  await expect(page.getByText("Pending", { exact: true })).toBeVisible();
});

test("2. the CRM admin sets the rates and verifies the deposit", async ({ page }) => {
  await crmSignIn(page, "crm-admin@edgeacademy.local");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`${E2E.crm}/settings`);
  await page.getByLabel("1st deposit (%)").fill("10");
  await page.getByRole("button", { name: "Save commission rates" }).click();
  await expect(page.getByText(/Commission rates saved/)).toBeVisible();

  await page.goto(`${E2E.crm}/deposits?status=PENDING`);
  const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: lead.name }) });
  await row.getByRole("button", { name: "Verify" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText(/Deposit verified/)).toBeVisible();

  await page.goto(`${E2E.crm}/deposits?status=VERIFIED`);
  const verified = page.getByRole("row").filter({ has: page.getByRole("link", { name: lead.name }) });
  await expect(verified.getByText("USD 100.00")).toBeVisible();
  await expect(verified.getByText("Sales Desk")).toBeVisible();

  await page.goto(`${E2E.crm}/team`);
  await page.getByRole("link", { name: "Sales Desk" }).click();
  await expect(page.getByText("Commission", { exact: true })).toBeVisible();
  await expect(page.getByText("Total earned")).toBeVisible();
  await expect(page.getByRole("link", { name: lead.name })).toBeVisible();
});

test("3. the sales executive sees the commission on the lead and the leaderboard", async ({ page }) => {
  await crmSignIn(page, "sales@edgeacademy.local");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(leadUrl);
  await expect(page.getByText("Verified", { exact: true })).toBeVisible();
  await expect(page.getByText(/Commission USD 100\.00/)).toBeVisible();

  await page.getByRole("link", { name: "Leaderboard" }).first().click();
  await expect(page).toHaveURL(/\/leaderboard$/);
  await expect(page.getByText("My commission")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Sales Desk (you)" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Commission" })).toHaveCount(0); // everyone's commission is for admins
});
