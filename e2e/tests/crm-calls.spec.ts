import { expect, test, type APIRequestContext } from "@playwright/test";
import { E2E } from "../config";
import { crmSignIn } from "./helpers";

/**
 * A phone uploads a call -> it shows on the lead's timeline -> a manager sees it on the Calls report with the phone's
 * status -> removing the phone cuts it off on its next request.
 */
test.describe.configure({ mode: "serial" });

const uniq = Date.now().toString().slice(-7);
const lead = { name: `E2E Caller ${uniq}`, phone: `+97155${uniq}` };
let token = "";
let leadId = "";

const asPhone = (request: APIRequestContext, method: "get" | "post", path: string, data?: unknown) =>
  request[method](`${E2E.api}${path}`, { headers: { authorization: `Bearer ${token}` }, data });

test("1. a phone signs in, adds a lead and uploads a call", async ({ request }) => {
  const signIn = await request.post(`${E2E.api}/api/v1/mobile/auth/sign-in`, {
    data: { email: "sales@edgeacademy.local", password: E2E.staffPassword, device: { model: "Playwright Phone", appVersion: "0.1.0" } },
  });
  expect(signIn.ok()).toBe(true);
  token = (await signIn.json()).token;

  const options = await (await asPhone(request, "get", "/api/v1/crm/options")).json();
  const projectId = options.projects.find((p: { isDefault: boolean }) => p.isDefault).id;
  const created = await asPhone(request, "post", "/api/v1/crm/leads", {
    projectId,
    name: lead.name,
    phone: lead.phone,
    source: "PHONE_IN",
  });
  expect(created.ok()).toBe(true);
  leadId = (await created.json()).id;

  const sync = await asPhone(request, "post", "/api/v1/mobile/calls/sync", {
    trackingOn: true,
    appVersion: "0.1.0",
    calls: [
      { number: lead.phone, countryIso: "AE", startedAt: Date.now() + 60_000, durationSec: 252, direction: "OUT" },
      { number: "+971509999999", countryIso: "AE", startedAt: Date.now(), durationSec: 30, direction: "OUT" },
    ],
  });
  expect(await sync.json()).toMatchObject({ stored: 1, awaitingSheet: [{ leadId, durationSec: 252 }] });
});

test("2. the call shows on the lead's timeline, with its real length", async ({ page }) => {
  await crmSignIn(page, "crm-admin@edgeacademy.local");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`${E2E.crm}/leads/${leadId}`);
  await expect(page.getByText("Outgoing call · 4m 12s")).toBeVisible();
  await expect(page.getByText("Tracked from the phone")).toBeVisible();
});

test("3. a sales executive can't open the Calls report", async ({ page }) => {
  await crmSignIn(page, "sales@edgeacademy.local");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("link", { name: "Calls", exact: true })).toHaveCount(0);
  await page.goto(`${E2E.crm}/calls`);
  await expect(page.getByRole("heading", { name: "Calls", exact: true })).toHaveCount(0);
});

test("4. a manager sees the call and the phone, and removing the phone cuts it off", async ({ page, request }) => {
  await crmSignIn(page, "crm-admin@edgeacademy.local");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("link", { name: "Calls", exact: true }).click();
  await expect(page).toHaveURL(/\/calls$/);
  const row = page.getByRole("row", { name: /Sales Desk/ });
  await expect(row.getByText("Tracking", { exact: true })).toBeVisible();
  await expect(row.getByText(/Playwright Phone/)).toBeVisible();
  await expect(row.getByText(/^\d+m \d+s$/)).toBeVisible(); // not exact: a reused stack keeps earlier runs' calls

  await row.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove phone" }).click();
  await expect(page.getByRole("row", { name: /Sales Desk/ }).getByText("No phone")).toBeVisible();

  expect((await asPhone(request, "get", "/api/v1/crm/options")).status()).toBe(401);
});
