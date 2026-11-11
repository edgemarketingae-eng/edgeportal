import { expect, test, type Page } from "@playwright/test";
import { E2E } from "../config";
import { crmSignIn, expectNoReload, pickOption } from "./helpers";

/** Leads table: every column sorts in place; the date filter opens on today, widens, and clears back to today. */
test.describe.configure({ mode: "serial" });

const uniq = Date.now().toString().slice(-6);
const first = `AAA Sorter ${uniq}`;
const last = `ZZZ Sorter ${uniq}`;

async function addLead(page: Page, name: string, phone: string) {
  await page.goto(`${E2E.crm}/leads/new`);
  await pickOption(page, "Project", { index: 0 });
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Mobile (WhatsApp)").fill(phone);
  await page.getByRole("button", { name: "Create lead" }).click();
  await expect(page.getByText("Lead created.")).toBeVisible();
}

const rowNames = (page: Page) =>
  page
    .locator("tbody tr td:nth-child(2) a")
    .filter({ hasText: `Sorter ${uniq}` })
    .allInnerTexts();

test("column headers sort the list in place, and a second click reverses it", async ({ page }) => {
  await crmSignIn(page, "crm-admin@edgeacademy.local");
  await expect(page).toHaveURL(/\/dashboard$/);
  await addLead(page, last, `+97156${uniq}1`);
  await addLead(page, first, `+97156${uniq}2`);

  await page.goto(`${E2E.crm}/leads?q=${encodeURIComponent(`Sorter ${uniq}`)}`);
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expectNoReload(page, async () => {
    await page.getByRole("link", { name: "Sort by Lead" }).click();
    await expect(page).toHaveURL(/sort=name&dir=asc/);
    await expect.poll(() => rowNames(page)).toEqual([first, last]);
    await expect(page.getByRole("columnheader", { name: /Lead/ })).toHaveAttribute("aria-sort", "ascending");

    await page.getByRole("link", { name: /Sort by Lead/ }).click();
    await expect(page).toHaveURL(/sort=name&dir=desc/);
    await expect.poll(() => rowNames(page)).toEqual([last, first]);

    // Dates sort newest first on the first click; the search stays.
    await page.getByRole("link", { name: "Sort by Added" }).click();
    await expect(page).toHaveURL(/sort=created&dir=desc/);
    await expect(page).toHaveURL(/q=/);
    await expect.poll(() => rowNames(page)).toEqual([first, last]);
  });
  // Filters keep the sort.
  await pickOption(page, "Stage", "New");
  await expect(page).toHaveURL(/stage=NEW/);
  await expect(page).toHaveURL(/sort=created&dir=desc/);
});

test("leads open on today; another range hides today's leads, Clear filters brings them back", async ({ page }) => {
  await crmSignIn(page, "crm-admin@edgeacademy.local");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`${E2E.crm}/leads`);
  const dates = page.getByRole("button", { name: /^Added: / });
  await expect(dates).toHaveText(/Added: Today/);
  await expect(page.getByRole("link", { name: first })).toBeVisible();
  const clear = page.getByRole("button", { name: "Clear filters" });
  await expect(clear).toBeHidden();

  await expectNoReload(page, async () => {
    await dates.click();
    await page.getByRole("button", { name: "Yesterday", exact: true }).click();
    await expect(page).toHaveURL(/range=yesterday/);
    await expect(page.getByRole("link", { name: first })).toHaveCount(0);
    await expect(dates).toHaveText(/Added: Yesterday/);
    await expect(clear).toBeVisible();

    await clear.click();
    await expect(page).toHaveURL(/\/leads$/);
    await expect(page.getByRole("link", { name: first })).toBeVisible();

    // Date of: last activity, all time.
    await dates.click();
    await page.getByRole("radio", { name: "Last activity" }).click();
    await expect(page).toHaveURL(/on=activity/);
    await page.getByRole("button", { name: /^Last activity: / }).click();
    await page.getByRole("button", { name: "All time", exact: true }).click();
    await expect(page).toHaveURL(/range=all/);
    await expect(page).toHaveURL(/on=activity/);
  });

  // The quick views look across all dates.
  await page.goto(`${E2E.crm}/leads`);
  await page.getByRole("link", { name: "Mine", exact: true }).click();
  await expect(page).toHaveURL(/owner=me&range=all/);
  await expect(page.getByRole("button", { name: /^Added: / })).toHaveText(/All time/);
});

test("deposits open on today, and Pending review shows every pending deposit", async ({ page }) => {
  await crmSignIn(page, "crm-admin@edgeacademy.local");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`${E2E.crm}/deposits`);
  await expect(page.getByRole("button", { name: /^Deposited: / })).toHaveText(/Today/);
  await page.getByRole("link", { name: "Pending review" }).click();
  await expect(page).toHaveURL(/range=all&status=PENDING/);
  await expect(page.getByRole("button", { name: /^Deposited: / })).toHaveText(/All time/);
  await expect(page.getByLabel("Status", { exact: true })).toHaveText("Status: Pending");

  for (const path of ["leaderboard", "calls", "dashboard"]) {
    await page.goto(`${E2E.crm}/${path}`);
    await expect(page.getByRole("button", { name: /^Period: / })).toHaveText(/Today/);
  }
});
