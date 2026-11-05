import { expect, test, type Page } from "@playwright/test";
import { E2E } from "../config";
import { pickOption, staffSignIn } from "./helpers";

/**
 * HR journey in the staff portal: a salesperson's portal starts empty -> a super admin sets up their record, pay and
 * balance and marks attendance -> they apply for leave with a document -> it's approved -> a salary month with a USD
 * bonus closes -> they see "AED + USD" and open the breakdown, with a mouse and by touch. Needs a fresh stack: the first
 * salary month can only be started once.
 */
test.describe.configure({ mode: "serial", timeout: 180_000 });

const STAFF = "sales@edgeacademy.local";
const HR = "admin@edgeacademy.local";
const png = { name: "note.png", mimeType: "image/png", buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]) };

/**
 * Signs in and waits for the landing page, so the next navigation can't cancel the sign-in. A full suite run can hit
 * the limit of 30 sign-ins a minute, so it waits that out once.
 */
async function signIn(page: Page, email: string) {
  const landing = /\/(admin|staff)$/;
  await staffSignIn(page, email);
  await page.waitForURL(landing, { timeout: 5_000 }).catch(async () => {
    await expect(page.getByText("Too many attempts")).toBeVisible();
    await page.waitForTimeout(61_000);
    await staffSignIn(page, email);
    await expect(page).toHaveURL(landing);
  });
}

/** The Monday after next, in Dubai: always a future working day with the default Sunday off. */
function nextMonday() {
  const d = new Date(Date.now() + 4 * 3600_000);
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7) + 7);
  return d.toISOString().slice(0, 10);
}

test("1. a salesperson gets the staff portal, without classes or HR pages", async ({ page }) => {
  await signIn(page, STAFF);
  await expect(page).toHaveURL(/\/staff$/);
  await expect(page.getByRole("link", { name: "My leave" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Live classes" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Team" })).toHaveCount(0);
  await expect(page.getByText(/HR hasn.t set up your record yet/)).toBeVisible();
  await page.goto(`${E2E.console}/staff/hr/salary`);
  await expect(page).toHaveURL(/\/staff\?error=forbidden/);
  await expect(page.getByText(/You don.t have access/)).toBeVisible();
});

test("2. HR sets up the record, pay and balance, and marks today", async ({ page }) => {
  await signIn(page, HR);
  await page.goto(`${E2E.console}/staff/hr/team`);
  await page
    .getByRole("row", { name: /Not set up/ })
    .filter({ hasText: /sales/i })
    .first()
    .getByRole("link")
    .click();
  await expect(page).toHaveURL(/\/staff\/hr\/team\/[a-f0-9]{24}/);
  await page.getByLabel("Joined on").fill("2024-01-15");
  await page.getByLabel("Department").fill("Sales");
  await page.getByRole("button", { name: "Set up record" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await pickOption(page, "Currency", "AED");
  await page.getByLabel("Base salary").fill("3000");
  await page.getByRole("button", { name: "Save pay" }).click();
  await expect(page.getByText("Pay saved.")).toBeVisible();

  await page.getByRole("button", { name: "Adjust balance" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Days").fill("12");
  await dialog.getByLabel("Why").fill("Opening balance");
  await dialog.getByRole("button", { name: "Adjust" }).click();
  await expect(page.getByText("Balance adjusted.")).toBeVisible();

  await page.goto(`${E2E.console}/staff/hr/attendance`);
  await page.getByRole("button", { name: "Mark all present" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Attendance saved.")).toBeVisible();
});

test("3. they apply for leave with a document", async ({ page }) => {
  await signIn(page, STAFF);
  await page.goto(`${E2E.console}/staff/leave`);
  await expect(page.getByText("12 days", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Apply for leave" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("First day").fill(nextMonday());
  await dialog.locator('input[type="file"]').setInputFiles(png);
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Leave request sent to HR.")).toBeVisible();
  await expect(page.getByRole("cell", { name: /Pending/ })).toBeVisible();
});

test("4. HR opens the document and approves", async ({ page, context }) => {
  await signIn(page, HR);
  await page.goto(`${E2E.console}/staff/hr/leave?status=PENDING`);
  const [file] = await Promise.all([context.waitForEvent("page"), page.getByRole("link", { name: "note.png" }).click()]);
  await expect.poll(() => file.url()).toMatch(/\/staff\/files\/[a-f0-9]{24}$/);
  await file.close();
  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Leave approved.")).toBeVisible();
});

test("5. HR closes a month with a USD bonus", async ({ page }) => {
  await signIn(page, HR);
  await page.goto(`${E2E.console}/staff/hr/salary`);
  await page.getByRole("button", { name: "Start first month" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Start" }).click();
  await expect(page.getByText("Month started.")).toBeVisible();
  await page
    .getByRole("link", { name: /\d{4}$/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/staff\/hr\/salary\/\d{4}-\d{2}$/);

  await page.getByRole("button", { name: "Add line" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("What it's for").fill("Top seller");
  await dialog.getByLabel("Amount").fill("100");
  await pickOption(page, dialog.getByLabel("Currency", { exact: true }).filter({ visible: true }), "USD");
  await dialog.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Line added.")).toBeVisible();

  await page.getByRole("button", { name: "Close month" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Close month" }).click();
  await expect(page.getByText(/Month closed/)).toBeVisible();
});

test("6. they see each currency, and the breakdown on hover", async ({ page }) => {
  await signIn(page, STAFF);
  await page.goto(`${E2E.console}/staff/salary`);
  const total = page.getByRole("button", { name: /3,000 AED \+ .*USD/ });
  await expect(total).toBeVisible();
  await total.hover();
  const breakdown = page.getByRole("dialog");
  await expect(breakdown.getByText("Salary")).toBeVisible();
  await expect(breakdown.getByText("Top seller")).toBeVisible();
  // First: after the CRM specs, commission of the same amount can be on this payslip too.
  await expect(breakdown.getByText("100 USD").first()).toBeVisible();

  await page
    .getByRole("link", { name: /\d{4}$/ })
    .first()
    .click();
  await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeVisible();
  // Exactly one: the line on the payslip, with the list page's breakdown not left floating over it.
  await expect(page.getByText("Top seller").filter({ visible: true })).toHaveCount(1);
});

test("7. the breakdown opens by tap on a phone", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 800 } });
  const page = await context.newPage();
  await signIn(page, STAFF);
  await page.goto(`${E2E.console}/staff/salary`);
  await page.getByRole("button", { name: /3,000 AED \+ .*USD/ }).tap();
  await expect(page.getByRole("dialog").getByText("Top seller")).toBeVisible();
  await context.close();
});

test("8. a salesperson writes today's work update", async ({ page }) => {
  await signIn(page, STAFF);
  await page.goto(`${E2E.console}/staff/updates`);
  await page.getByLabel("Point 1", { exact: true }).fill("Followed up five leads");
  await page.getByLabel("Point 1", { exact: true }).press("Enter");
  await expect(page.getByLabel("Point 2", { exact: true })).toBeFocused();
  await page.keyboard.type("Demo call with a new prospect");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Update saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Point 2", { exact: true })).toHaveValue("Demo call with a new prospect");
});

// A test of its own: each test starts signed out, and /login sends a signed-in person straight to their portal.
test("9. HR reads it on Team updates, with who hasn't written one yet", async ({ page }) => {
  await signIn(page, HR);
  await page.goto(`${E2E.console}/staff/hr/updates`);
  await expect(page.getByText("Followed up five leads")).toBeVisible();
  await expect(page.getByText(/Not logged yet \(\d+\)/)).toBeVisible();
});
