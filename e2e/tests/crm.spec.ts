import { expect, test } from "@playwright/test";
import { E2E } from "../config";
import { crmSignIn, expectNoReload, studentSignIn } from "./helpers";

/**
 * CRM journey on the CRM host: the CRM admin sets up a project and a CRM account -> a sales executive on
 * that project creates a lead, logs a call and drags its follow-up across the board -> the admin converts
 * the lead -> the student sets a password from the welcome email, verifies the mobile and reaches the dashboard.
 */
test.describe.configure({ mode: "serial" });

const uniq = Date.now().toString().slice(-7);
const project = { name: `E2E Drive ${uniq}`, code: `E2E${uniq}` };
const account = { name: `E2E Exec ${uniq}`, email: `exec.${uniq}@edgeacademy.local`, tempPassword: "" };
const lead = { name: `E2E Lead ${uniq}`, email: `lead.${uniq}@example.com`, phone: `+97155${uniq}`, password: "LeadPass!2026" };
const task = `Call back about November ${uniq}`;

test("1. the CRM admin creates a project with the sales desk on it and a CRM-only account", async ({ page }) => {
  await crmSignIn(page, "crm-admin@edgeacademy.local");
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto(`${E2E.crm}/projects/new`);
  await page.getByLabel("Name", { exact: true }).fill(project.name);
  await page.getByLabel("Code", { exact: true }).fill(project.code);
  await page.getByRole("group", { name: "Sales executives" }).getByLabel("Sales Desk").check();
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[a-f0-9]{24}/);
  await expect(page.getByText("Project created.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sales Desk" })).toBeVisible();

  await page.goto(`${E2E.crm}/team`);
  await page.getByLabel("Full name").fill(account.name);
  await page.getByLabel("Login email").fill(account.email);
  await page
    .getByRole("group", { name: "CRM roles" })
    .getByLabel(/^Sales executive/)
    .check();
  await page.getByRole("group", { name: "Add to projects" }).getByLabel(project.name).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/Account created/)).toBeVisible();
  await expect(page.getByRole("link", { name: account.name })).toBeVisible();

  // Until they sign in, the team list shows the temporary password, masked until revealed.
  const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: account.name }) });
  await expect(row.getByText("Invited")).toBeVisible();
  const secret = row.getByLabel("Temporary password", { exact: true });
  await expect(secret).toHaveText(/^•+$/);
  await row.getByRole("button", { name: "Show temporary password" }).click();
  await expect(secret).toHaveText(/^Edge-/);
  account.tempPassword = (await secret.textContent())!;
});

test("1b. the new account signs in with that temporary password and sets their own", async ({ page }) => {
  await crmSignIn(page, account.email, account.tempPassword);
  await expect(page).toHaveURL(/\/change-password/);
  await page.getByLabel("Temporary password", { exact: true }).fill(account.tempPassword);
  await page.getByLabel("New password", { exact: true }).fill("ExecOwnPass!2026");
  await page.getByLabel("Confirm new password").fill("ExecOwnPass!2026");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.context().clearCookies();
  await crmSignIn(page, "crm-admin@edgeacademy.local");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`${E2E.crm}/team`);
  const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: account.name }) });
  await expect(row.getByText("Active")).toBeVisible();
  await expect(row.getByLabel("Temporary password", { exact: true })).toHaveCount(0);
});

test("2. the sales executive sees only their projects, creates a lead, logs a call and moves its task on the board", async ({ page }) => {
  await crmSignIn(page, "sales@edgeacademy.local");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("link", { name: "Team" })).toHaveCount(0); // no crm.staff.manage

  await page.goto(`${E2E.crm}/projects`);
  await expect(page.getByRole("link", { name: project.name })).toBeVisible();
  await expect(page.getByRole("link", { name: "New project" })).toHaveCount(0); // no crm.projects.manage

  await page.goto(`${E2E.crm}/leads/new`);
  await page.getByLabel("Project", { exact: true }).selectOption({ label: project.name });
  await page.getByLabel("Name", { exact: true }).fill(lead.name);
  await page.getByLabel("Mobile (WhatsApp)").fill(lead.phone);
  await page.getByLabel("Email", { exact: true }).fill(lead.email);
  await page.getByRole("button", { name: "Create lead" }).click();
  await expect(page).toHaveURL(/\/leads\/[a-f0-9]{24}/);
  await expect(page.getByText("Lead created.")).toBeVisible();
  await expect(page.getByRole("link", { name: project.name })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0); // only admins and CRM admins delete

  await page.getByRole("radiogroup", { name: "Activity type" }).getByText("Call").click();
  await page.getByLabel("Details").fill("Answered, wants the November batch");
  await page.getByRole("button", { name: "Log activity" }).click();
  await expect(page.getByText("Contacted", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Follow-up" }).click();
  await page.getByLabel("Title").fill(task);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("link", { name: task })).toBeVisible();

  // Board: drag the card from "To do" into "In progress"; the move is saved and survives a reload.
  await page.goto(`${E2E.crm}/tasks`);
  const todo = page.locator('[data-column="TODO"]');
  const inProgress = page.locator('[data-column="IN_PROGRESS"]');
  const card = todo.locator(".cursor-grab").filter({ has: page.getByRole("link", { name: task }) });
  await expect(card).toBeVisible();
  const from = (await card.boundingBox())!;
  const to = (await inProgress.boundingBox())!;
  const grabX = from.x + from.width / 2;
  const grabY = from.y + from.height - 8; // bottom row of the card, away from the title link
  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  await page.mouse.move(grabX + 12, grabY + 4, { steps: 4 }); // past the 6px activation distance
  await page.mouse.move(to.x + to.width / 2, to.y + 80, { steps: 25 });
  await page.mouse.up();
  await expect(inProgress.getByRole("link", { name: task })).toBeVisible();
  await page.reload();
  await expect(inProgress.getByRole("link", { name: task })).toBeVisible();
  await expect(todo.getByRole("link", { name: task })).toHaveCount(0);
});

test("3. filters and view links update the lists in place, without reloading the page", async ({ page }) => {
  await crmSignIn(page, "sales@edgeacademy.local");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`${E2E.crm}/leads`);
  const search = page.getByRole("searchbox", { name: "Search" });

  await expectNoReload(page, async () => {
    // A select applies on change.
    await page.getByLabel("Stage", { exact: true }).selectOption("CONTACTED");
    await expect(page).toHaveURL(/stage=CONTACTED/);
    await expect(page.getByRole("link", { name: lead.name })).toBeVisible();

    // The search box applies shortly after typing stops, keeping the other filters.
    await search.fill(lead.name);
    await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(lead.name);
    await expect(page).toHaveURL(/stage=CONTACTED/);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.getByRole("link", { name: lead.name })).toBeVisible();

    // A view link replaces the query, and the filter controls follow the URL.
    await page.getByRole("link", { name: "Mine", exact: true }).click();
    await expect(page).toHaveURL(/\/leads\?owner=me$/);
    await expect(page.getByLabel("Owner", { exact: true })).toHaveValue("me");
    await expect(page.getByLabel("Stage", { exact: true })).toHaveValue("");
    await expect(search).toHaveValue("");
  });

  await page.goto(`${E2E.crm}/tasks`);
  await expectNoReload(page, async () => {
    await page.getByLabel("Priority", { exact: true }).selectOption("MEDIUM");
    await expect(page).toHaveURL(/priority=MEDIUM/);
    await expect(page.locator('[data-column="IN_PROGRESS"]').getByRole("link", { name: task })).toBeVisible();

    await page.getByRole("link", { name: "List", exact: true }).click();
    await expect(page).toHaveURL(/view=list/);
    await expect(page).toHaveURL(/priority=MEDIUM/);
    await expect(page.getByRole("link", { name: task })).toBeVisible();
  });
});

test("4. the CRM admin finds the lead across projects and converts it into a student", async ({ page }) => {
  await crmSignIn(page, "crm-admin@edgeacademy.local");
  await expect(page).toHaveURL(/\/dashboard$/); // let the sign-in redirect finish before navigating away
  await page.goto(`${E2E.crm}/leads?q=${encodeURIComponent(lead.name)}&view=all`);
  await page.getByRole("link", { name: lead.name }).click();
  await page.getByRole("button", { name: "Convert to student" }).click();
  await page.getByLabel("Enroll in batch").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Create student account" }).click();
  await expect(page.getByText(/Student account created/)).toBeVisible();
  await expect(page.getByText("Student account", { exact: true })).toBeVisible();
  await expect(page.getByText("Converted", { exact: true }).first()).toBeVisible();
});

test("5. the new student sets a password, verifies the mobile and sees the dashboard", async ({ page, request }) => {
  const mail = await request.get(`${E2E.api}/api/dev/last-email?to=${encodeURIComponent(lead.email)}`);
  expect(mail.ok()).toBe(true);
  const { payload } = await mail.json();
  await page.goto(payload.setPasswordUrl as string);
  await page.getByLabel("New password", { exact: true }).fill(lead.password);
  await page.getByLabel("Confirm new password").fill(lead.password);
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page).toHaveURL(/login/);

  await studentSignIn(page, lead.email, lead.password);
  await expect(page).toHaveURL(/verify-phone/);
  await page.getByRole("button", { name: "Resend code" }).click();
  await page.locator('input[name="code"]').fill("000000");
  await page.getByRole("button", { name: "Verify mobile number" }).click();
  await expect(page).toHaveURL(/dashboard/);
});

test("6. the CRM admin deletes junk leads from the lead page and from the list", async ({ page }) => {
  await crmSignIn(page, "crm-admin@edgeacademy.local");
  await expect(page).toHaveURL(/\/dashboard$/);
  const junk = [`E2E Junk A ${uniq}`, `E2E Junk B ${uniq}`, `E2E Junk C ${uniq}`];
  for (const [i, name] of junk.entries()) {
    await page.goto(`${E2E.crm}/leads/new`);
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("Mobile (WhatsApp)").fill(`+97156${uniq.slice(1)}${i}`);
    await page.getByRole("button", { name: "Create lead" }).click();
    await expect(page.getByText("Lead created.")).toBeVisible();
  }

  // From the lead page: needs DELETE typed, then lands on the list.
  await page.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/removed for good/)).toBeVisible();
  await dialog.getByLabel(/to confirm/).fill("delete");
  await dialog.getByRole("button", { name: "Delete lead" }).click();
  await expect(page).toHaveURL(/\/leads\?deleted=1$/);
  await expect(page.getByText("Lead deleted.")).toBeVisible();

  // From the list: tick the other two and delete them together.
  await page.goto(`${E2E.crm}/leads?q=${encodeURIComponent(`E2E Junk`)}&view=all`);
  await expect(page.getByRole("link", { name: junk[2] })).toHaveCount(0);
  for (const name of junk.slice(0, 2)) await page.getByRole("checkbox", { name: `Select ${name}` }).check();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("dialog").getByText("Delete 2 leads?")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByLabel(/to confirm/)
    .fill("DELETE");
  await page.getByRole("dialog").getByRole("button", { name: "Delete leads" }).click();
  await expect(page.getByText("2 leads deleted.")).toBeVisible();
  await expect(page.getByRole("link", { name: junk[0] })).toHaveCount(0);
  await expect(page.getByRole("link", { name: junk[1] })).toHaveCount(0);
  // The real lead (now a student) is untouched.
  await page.goto(`${E2E.crm}/leads?q=${encodeURIComponent(lead.name)}&view=all`);
  await expect(page.getByRole("link", { name: lead.name })).toBeVisible();
});

test("7. help & docs show each role the guides for what they can do", async ({ page }) => {
  await crmSignIn(page, "sales@edgeacademy.local");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("link", { name: "Help & docs" }).first().click();
  await expect(page).toHaveURL(/\/docs$/);
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: /Working a lead/ })).toBeVisible();
  await expect(main.getByRole("link", { name: /Managing the CRM team/ })).toHaveCount(0);
  await expect(main.getByRole("link", { name: /Deleting leads/ })).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Search the guides" }).fill("follow-up");
  await page.getByRole("main").getByRole("link", { name: /Tasks/ }).first().click();
  await expect(page).toHaveURL(/\/docs\/tasks$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "On this page" })).toBeVisible();
  await page.goto(`${E2E.crm}/docs/team`);
  await expect(page.getByText(/could not be found|not found/i).first()).toBeVisible();

  await page.context().clearCookies();
  await crmSignIn(page, "crm-admin@edgeacademy.local");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`${E2E.crm}/leads`);
  await page.getByRole("link", { name: "How this works" }).click();
  await expect(page).toHaveURL(/\/docs\/leads$/);
  await page.goto(`${E2E.crm}/docs`);
  await expect(page.getByRole("main").getByRole("link", { name: /Deleting leads/ })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: /Managing the CRM team/ })).toBeVisible();
});
