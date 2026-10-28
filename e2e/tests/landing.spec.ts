import { expect, test } from "@playwright/test";
import { E2E } from "../config";
import { crmSignIn } from "./helpers";

/**
 * Free class landing page: a signed-out visitor from an ad opens the student app's home page, joins the free class
 * with name and WhatsApp, lands in a sales executive's WhatsApp chat with the message typed in, and the lead shows
 * up in the CRM assigned to that person.
 */
test.describe.configure({ mode: "serial" });

const uniq = Date.now().toString().slice(-7);
const visitor = { name: `Landing Visitor ${uniq}`, phone: `56${uniq}` };

test("1. a visitor joins the free class and is sent to the sales executive's WhatsApp", async ({ page }) => {
  let whatsapp = "";
  await page.route("https://wa.me/**", async (route) => {
    whatsapp = route.request().url();
    await route.fulfill({ contentType: "text/html", body: "<h1>WhatsApp</h1>" });
  });

  await page.goto(`${E2E.student}/?utm_source=meta&utm_campaign=e2e-free-class`);
  await expect(page).toHaveURL(`${E2E.student}/?utm_source=meta&utm_campaign=e2e-free-class`); // public: no redirect to /login
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Forex & Gold");
  // No class date set in this stack: the streamed card shows the evergreen invitation.
  await expect(page.getByText(/New free classes run regularly/)).toBeVisible();
  // await expect(page.getByRole("link", { name: "Student login" })).toHaveAttribute("href", "/login");

  await page.getByRole("button", { name: "Contact support" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Full name").fill(visitor.name);
  await dialog.getByLabel("WhatsApp number").fill(visitor.phone);
  await dialog.getByRole("button", { name: "Contact support" }).click();

  await expect(page.getByRole("heading", { name: "WhatsApp" })).toBeVisible();
  const url = new URL(whatsapp);
  expect(url.pathname).toMatch(/^\/971\d{8,9}$/);
  expect(url.searchParams.get("text")).toMatch(new RegExp(`^Hi \\S+, I'm ${visitor.name}\\. I'd like to join the free live trading class`));
});

test("2. the lead is in the CRM General project, owned by a sales executive, with the ad's UTM tags", async ({ page }) => {
  await crmSignIn(page, "crm-admin@edgeacademy.local");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`${E2E.crm}/leads?q=${encodeURIComponent(visitor.name)}&view=all`);
  await page.getByRole("link", { name: visitor.name }).first().click();
  await expect(page).toHaveURL(/\/leads\/[a-f0-9]{24}/);
  await expect(page.getByText("General").first()).toBeVisible();
  await expect(page.getByText(`+971${visitor.phone}`).first()).toBeVisible();
  await expect(page.getByText(/Sent to .+ WhatsApp from the free class page/)).toBeVisible();
  await expect(page.getByText("e2e-free-class").first()).toBeVisible();
  await expect(page.getByText(/· General · Owner \S/)).toBeVisible();
});
