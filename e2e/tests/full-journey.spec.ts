import { expect, test } from "@playwright/test";
import { E2E } from "../config";
import { dubaiNowPlus, staffSignIn, studentSignIn } from "./helpers";

/**
 * One student's life cycle across both apps, with every integration mocked:
 * sign-up -> OTP -> advance (Tabby, mock gateway) -> admissions approval -> mentor schedules a
 * Meet class and adds a recording -> student joins and watches -> due date passes -> auto-lock ->
 * balance payment -> auto-unlock.
 */
test.describe.configure({ mode: "serial" });

const uniq = Date.now().toString().slice(-7);
const student = { name: `E2E Student ${uniq}`, email: `e2e.${uniq}@example.com`, phone: `+97150${uniq}`, password: "Sup3rSecret!" };

test("1. student signs up, verifies phone and pays an advance", async ({ page }) => {
  await page.goto(`${E2E.student}/signup`);
  await page.getByLabel("Full name", { exact: true }).fill(student.name);
  await page.getByLabel("Email", { exact: true }).fill(student.email);
  await page.getByLabel("Mobile number (WhatsApp)").fill(student.phone);
  await page.getByLabel("Password", { exact: true }).fill(student.password);
  await page.getByLabel("I agree to the academy terms").check();
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/verify-phone/);
  await page.locator('input[name="code"]').fill("000000");
  await page.getByRole("button", { name: "Verify mobile number" }).click();

  await expect(page).toHaveURL(/dashboard/);
  await page.getByRole("link", { name: "Choose a payment plan" }).first().click();
  await page.getByRole("button", { name: /Pay an advance/ }).click();
  await page.getByRole("button", { name: "AED 300.00" }).click();
  await page.getByText("Tabby", { exact: true }).click();
  await expect(page.getByText("VAT (5%)")).toBeVisible();
  await page.getByRole("button", { name: /^Pay AED/ }).click();

  await expect(page).toHaveURL(/dev\/mock-checkout/);
  await page.getByRole("button", { name: "Pay successfully" }).click();
  await expect(page.getByText("Payment successful")).toBeVisible();

  await page.goto(`${E2E.student}/dashboard`);
  await expect(page.getByText("Payment received. We are verifying your registration.")).toBeVisible();
  // Locked menu items stay locked until approval
  await page.goto(`${E2E.student}/classes`);
  await expect(page.getByText("Payment received. We are verifying your registration.")).toBeVisible();
});

test("2. admissions approves the student", async ({ page }) => {
  await staffSignIn(page, "admissions@edgeacademy.local");
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole("link", { name: /Approvals/ }).first().click();
  const card = page.locator("div[data-slot=card]", { hasText: student.email });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Approved. The student has been emailed.")).toBeVisible();
  await expect(page.locator("div[data-slot=card]", { hasText: student.email })).toHaveCount(0);
});

test("3. mentor schedules a Meet class and adds a recording", async ({ page }) => {
  await staffSignIn(page, "mentor@edgeacademy.local");
  await expect(page).toHaveURL(/\/staff$/);
  await page.getByRole("link", { name: "Live classes" }).first().click();
  const when = dubaiNowPlus(5);
  await page.getByLabel("Title").fill(`E2E class ${uniq}`);
  await page.getByLabel("Date").fill(when.date);
  await page.getByLabel("Start (Dubai time)").fill(when.time);
  await page.getByRole("button", { name: "Schedule class" }).click();
  await expect(page.getByText(/Class scheduled/)).toBeVisible();
  await expect(page.getByRole("cell", { name: new RegExp(`E2E class ${uniq}`) })).toBeVisible();
  await expect(page.getByText("Meet · auto-record").first()).toBeVisible();

  await page.getByRole("link", { name: "Recordings" }).first().click();
  await page.getByLabel("Google Drive link").fill(`https://drive.google.com/file/d/1e2eFile${uniq}abcdef/view`);
  await page.getByLabel("Title").fill(`E2E recording ${uniq}`);
  await page.getByRole("button", { name: "Add recording" }).click();
  await expect(page.getByText(/Recording added/)).toBeVisible();
});

test("4. student joins the class and watches the recording", async ({ page }) => {
  await studentSignIn(page, student.email, student.password);
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByRole("link", { name: "Join the group" })).toBeVisible();

  await page.goto(`${E2E.student}/classes`);
  const row = page.locator("div[data-slot=card]", { hasText: `E2E class ${uniq}` });
  const join = row.getByRole("link", { name: "Join now" });
  await expect(join).toBeVisible();
  const href = await join.getAttribute("href");
  expect(href).not.toContain("meet.google.com"); // the real link never reaches the page
  // The gated join redirects to the Meet URL; stub Meet itself so the test stays offline.
  await page.route("https://meet.google.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>Meet</title>" }));
  await page.goto(new URL(href!, E2E.student).toString());
  await expect(page).toHaveURL(/^https:\/\/meet\.google\.com\//);

  await page.goto(`${E2E.student}/recordings`);
  await page.getByText(`E2E recording ${uniq}`).click();
  const video = page.locator("video");
  await expect(video).toBeVisible();
  const duration = await video.evaluate(
    (v: HTMLVideoElement) =>
      new Promise<number>((resolve) => {
        if (v.readyState >= 1) return resolve(v.duration);
        v.addEventListener("loadedmetadata", () => resolve(v.duration), { once: true });
        v.load();
      }),
  );
  expect(duration).toBeGreaterThan(1);
  await expect(page.getByText(student.name, { exact: false }).first()).toBeVisible(); // watermark
});

test("5. overdue balance locks access; paying it restores access", async ({ page, request }) => {
  const asOf = new Date(Date.now() + 40 * 86_400_000).toISOString();
  const run = await request.post(`${E2E.api}/api/dev/jobs/enrollment.autolock`, { data: { asOf } });
  expect(run.ok()).toBe(true);
  expect((await run.json()).result.locked).toBeGreaterThanOrEqual(1);

  await studentSignIn(page, student.email, student.password);
  await expect(page.getByText("Your access is paused")).toBeVisible();
  await page.getByRole("link", { name: /^Pay AED/ }).first().click();
  await expect(page).toHaveURL(/checkout\/balance/);
  await page.getByRole("button", { name: /^Pay AED/ }).click();
  await page.getByRole("button", { name: "Pay successfully" }).click();
  await expect(page.getByText("Payment successful")).toBeVisible();

  await page.goto(`${E2E.student}/dashboard`);
  await expect(page.getByText("Fully paid")).toBeVisible();
  await expect(page.getByText("Lifetime access")).toBeVisible();
  await expect(page.getByText("Your access is paused")).toHaveCount(0);
});
