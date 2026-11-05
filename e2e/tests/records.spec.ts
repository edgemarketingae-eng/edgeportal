import { expect, test } from "@playwright/test";
import { E2E } from "../config";
import { crmSignIn, staffSignIn } from "./helpers";

/**
 * Changing a sign-in email and deleting accounts and records: a CRM admin fixes a new hire's email, finds the account
 * can't go until it's disabled, then deletes it behind a typed DELETE; a super admin deletes a course the same way,
 * and people without `records.delete` never see those buttons.
 */
test.describe.configure({ mode: "serial" });

const uniq = Date.now().toString().slice(-7);
const hire = { name: `Typo Hire ${uniq}`, email: `typo.${uniq}@edge.test`, fixed: `fixed.${uniq}@edge.test` };
const course = { code: `DEL-${uniq}`, title: `Delete Me ${uniq}` };

test("1. a CRM admin changes a new hire's email, then deletes the unused account", async ({ page }) => {
  await crmSignIn(page, "crm-admin@edgeacademy.local");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`${E2E.crm}/team`);
  await page.getByLabel("Full name").fill(hire.name);
  await page.getByLabel("Login email").fill(hire.email);
  await page.getByLabel("Sales executive").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("link", { name: hire.name, exact: true }).click();
  await expect(page).toHaveURL(/\/team\/[a-f0-9]{24}$/);

  await page.getByRole("button", { name: "Change email" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("New sign-in email").fill(hire.fixed);
  await dialog.getByRole("button", { name: "Change email" }).click();
  await expect(page.getByText(`Email changed. The invitation was sent again to ${hire.fixed}.`)).toBeVisible();
  await expect(page.getByText(hire.fixed).first()).toBeVisible();

  // Not disabled yet: the card says why and offers no delete.
  await expect(page.getByText("Disable the account first, so nothing new reaches them while you delete it")).toBeVisible();
  await page.getByRole("button", { name: "Disable account" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Disable account" }).click();
  await expect(page.getByText("Account disabled and signed out.")).toBeVisible();

  await page.getByRole("button", { name: "Delete account" }).click();
  const confirm = page.getByRole("dialog");
  await expect(confirm.getByRole("heading", { name: `Delete ${hire.name}?` })).toBeVisible();
  const submit = confirm.getByRole("button", { name: "Delete account" });
  await expect(submit).toBeDisabled();
  await confirm.getByLabel("Type DELETE to confirm").fill("delete");
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page).toHaveURL(/\/team$/);
  await expect(page.getByText(`${hire.name}'s account deleted.`)).toBeVisible();
  await expect(page.getByRole("link", { name: hire.name, exact: true })).toHaveCount(0);
});

test("2. CRM admins don't get super-admin deletes", async ({ page }) => {
  await crmSignIn(page, "crm-admin@edgeacademy.local");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`${E2E.crm}/products`);
  await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Delete / })).toHaveCount(0);
});

test("3. a super admin deletes an unused course behind a typed DELETE", async ({ page }) => {
  await staffSignIn(page, "admin@edgeacademy.local");
  await expect(page).toHaveURL(/\/admin/);
  await page.goto(`${E2E.console}/admin/batches`);
  const add = page.locator("form").filter({ has: page.getByRole("button", { name: "Add course" }) });
  await add.getByLabel("Code").fill(course.code);
  await add.getByLabel("Title").fill(course.title);
  await add.getByRole("button", { name: "Add course" }).click();
  const card = page.locator("[data-slot=card]").filter({ hasText: course.title }).first();
  await expect(card).toBeVisible();
  await card.getByText("Edit course").click();
  await card.getByRole("button", { name: "Delete course" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: `Delete the course ${course.title}?` })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Delete", exact: true })).toBeDisabled();
  await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText(`${course.title} deleted.`)).toBeVisible();
  await expect(page.getByText(course.title, { exact: true })).toHaveCount(0);
});
