import { expect, test } from "@playwright/test";
import { E2E } from "../config";
import { crmSignIn, expectNoReload } from "./helpers";

/**
 * Students from outside the UAE, paged lists with select-all and round-robin, project teams, pointer cursors.
 */
test.describe.configure({ mode: "serial" });

const uniq = Date.now().toString().slice(-7);
const project = { name: `E2E Pool ${uniq}`, code: `POOL${uniq}` };

test("a student from India signs up with their country and only sees international payment options without UAE VAT", async ({ page }) => {
  await page.goto(`${E2E.student}/signup`);
  await page.getByLabel("Full name", { exact: true }).fill(`E2E India ${uniq}`);
  await page.getByLabel("Email", { exact: true }).fill(`e2e.in.${uniq}@example.com`);
  await page.getByLabel("Mobile number (WhatsApp)").fill(`+91 98${uniq.slice(0, 3)} ${uniq.slice(3)}0`);
  // The residence follows the number's country until the person picks one.
  await expect(page.getByLabel("Country of residence")).toHaveValue("IN");
  await expect(page.getByLabel("Country code")).toHaveValue("IN");
  await page.getByLabel("Password", { exact: true }).fill("Sup3rSecret!");
  await page.getByLabel("I agree to the academy terms").check();
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/verify-phone/);
  await page.locator('input[name="code"]').fill("000000");
  await page.getByRole("button", { name: "Verify mobile number" }).click();
  await expect(page).toHaveURL(/dashboard/);

  await page.getByRole("link", { name: "Choose a payment plan" }).first().click();
  await page.getByRole("button", { name: /Pay in full/ }).click();
  await expect(page.getByText("Card (international)", { exact: true })).toBeVisible();
  await expect(page.getByText("Card (UAE)", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Tabby", { exact: true })).toHaveCount(0);
  await page.getByText("Card (international)", { exact: true }).click();
  await expect(page.getByText("VAT (5%)")).toHaveCount(0);
});

test("the CRM admin builds a project team, imports leads round-robin, pages through them and bulk-acts on all matching", async ({
  page,
}) => {
  await crmSignIn(page, "crm-admin@edgeacademy.local");
  await expect(page).toHaveURL(/\/dashboard$/);

  // Project with no team yet, then people added from its page.
  await page.goto(`${E2E.crm}/projects/new`);
  await page.getByLabel("Name", { exact: true }).fill(project.name);
  await page.getByLabel("Code", { exact: true }).fill(project.code);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[a-f0-9]{24}/);
  const projectUrl = page.url().split("?")[0]!;
  await page.getByRole("button", { name: "Add people" }).click();
  const add = page.getByRole("dialog");
  await add.getByLabel(/^Sales Desk/).check();
  await add.getByLabel(/^Demo Project Manager/).check();
  await add.getByRole("button", { name: "Add to project" }).click();
  await expect(page.getByText("2 people added.")).toBeVisible();
  const team = page.locator("table").filter({ hasText: "Overdue" }).first();
  await expect(team.getByRole("link", { name: "Sales Desk" })).toBeVisible();
  await expect(team.getByRole("link", { name: "Demo Project Manager" })).toBeVisible();

  // Import 60 leads, shared round-robin. Only Sales Desk is a sales executive on the team.
  const csv = [
    "name,phone",
    ...Array.from(
      { length: 60 },
      (_, i) => `E2E Pool ${uniq} ${String(i).padStart(2, "0")},+97158${uniq.slice(2)}${String(i).padStart(2, "0")}`,
    ),
  ].join("\n");
  await page.goto(`${E2E.crm}/import`);
  await page.locator('textarea[name="csv"]').fill(csv);
  await page.getByLabel("Project", { exact: true }).selectOption({ label: project.name });
  await page.getByLabel("Owner", { exact: true }).selectOption("ROUND_ROBIN");
  await page.getByRole("button", { name: "Check the file" }).click();
  await page.getByRole("button", { name: "Import 60 leads" }).click();
  await expect(page.getByText(/60 created/).first()).toBeVisible();

  // Paged list: 50 + 10, page links don't reload.
  await page.goto(`${E2E.crm}/leads?q=${encodeURIComponent(`E2E Pool ${uniq}`)}&view=all`);
  const pager = page.getByRole("navigation", { name: "Pagination" });
  await expect(pager.getByText("Showing 1–50 of 60 leads")).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(50);
  await expect(page.locator("tbody").getByText("Sales Desk").first()).toBeVisible();
  await expectNoReload(page, async () => {
    await pager.getByRole("link", { name: "Page 2" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.locator("tbody tr")).toHaveCount(10);
  });

  // Select the page, then everything matching, and hand them all to one person.
  await page.getByRole("link", { name: "Page 1" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(50);
  await page.getByRole("checkbox", { name: "Select all leads on this page" }).check();
  await expect(page.getByText("50 selected")).toBeVisible();
  await page.getByRole("button", { name: "Select all 60 leads matching these filters" }).click();
  await expect(page.getByText("All 60 leads matching")).toBeVisible();
  await page.getByLabel("Assign to").selectOption({ label: "Demo Project Manager" });
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page.getByText("60 leads assigned.")).toBeVisible();

  // And back to the sales executives, round-robin.
  await page.getByRole("checkbox", { name: "Select all leads on this page" }).check();
  await page.getByRole("button", { name: "Select all 60 leads matching these filters" }).click();
  await page.getByLabel("Assign to").selectOption("ROUND_ROBIN");
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page.getByText("60 leads shared out round-robin.")).toBeVisible();

  // Finally delete them all.
  await page.getByRole("checkbox", { name: "Select all leads on this page" }).check();
  await page.getByRole("button", { name: "Select all 60 leads matching these filters" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Delete 60 leads?")).toBeVisible();
  await dialog.getByLabel(/to confirm/).fill("DELETE");
  await dialog.getByRole("button", { name: "Delete leads" }).click();
  await expect(page.getByText("60 leads deleted.")).toBeVisible();
  await expect(page.getByText("No leads match these filters.")).toBeVisible();

  // The project's team survives on its page.
  await page.goto(projectUrl);
  await expect(page.getByRole("button", { name: "Add people" })).toBeVisible();
});

test("clickable controls show a pointer", async ({ page }) => {
  await crmSignIn(page, "crm-admin@edgeacademy.local");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`${E2E.crm}/leads/new`);
  const cursor = (selector: ReturnType<typeof page.locator>) => selector.evaluate((el) => getComputedStyle(el).cursor);
  expect(await cursor(page.getByLabel("Project", { exact: true }))).toBe("pointer");
  expect(await cursor(page.getByRole("button", { name: "Create lead" }))).toBe("pointer");
  expect(await cursor(page.getByRole("checkbox").first())).toBe("pointer");
  expect(await cursor(page.getByLabel("Country code"))).toBe("pointer");
});

test("CRM country pickers search: the dial code and the lead's country", async ({ page }) => {
  await crmSignIn(page, "crm-admin@edgeacademy.local");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`${E2E.crm}/leads/new`);
  const code = page.getByRole("button", { name: "Country code" }).filter({ visible: true });
  await expect(code).toContainText("+971");
  await code.click();
  const search = page.getByRole("combobox", { name: "Search countries" });
  await search.fill("ind");
  await expect(page.getByRole("option").first()).toContainText("India");
  await search.press("Enter");
  await expect(code).toContainText("+91");
  // A dial code finds its country too, and the list closes on a click.
  await code.click();
  await search.fill("+44");
  await page.getByRole("option", { name: /United Kingdom/ }).click();
  await expect(code).toContainText("+44");

  const country = page.getByRole("button", { name: "Country", exact: true }).filter({ visible: true });
  await expect(country).toContainText("Detect from mobile");
  await country.click();
  await search.fill("uae");
  await page.getByRole("option", { name: /United Arab Emirates/ }).click();
  await expect(country).toContainText("United Arab Emirates");
});
