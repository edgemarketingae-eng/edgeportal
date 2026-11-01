import { createHmac } from "node:crypto";
import { crmRoutes, mobileRoutes } from "@edge/contracts";
import { AuthSession, AuthUser, CrmDevice, StaffProfile } from "@edge/db";
import { createStaff, resetEnvForTests, resetStaffPassword, setStaffDisabled } from "@edge/services";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { closeTestDb, CRM, INTERNAL, resetDb, startApi } from "./helpers";

type Api = Awaited<ReturnType<typeof startApi>>;
let auth: Api["auth"];
let app: Api["app"];
beforeAll(async () => {
  ({ auth } = await startApi());
});
afterAll(closeTestDb);
// A fresh app per test: the sign-in rate limit lives on the app and these tests sign in a lot.
beforeEach(async () => {
  await resetDb();
  app = createApp({ auth, logger: false });
});

const PASSWORD = "StaffPass!2026";
const device = { model: "Test Phone", androidVersion: "15", appVersion: "0.1.0" };
const signIn = mobileRoutes.signIn.path;

let seq = 0;
async function staff(role: string) {
  seq += 1;
  const email = `${role}-${seq}@edge.test`;
  const { id } = await createStaff({ name: `${role} ${seq}`, email, roleKeys: [role], password: PASSWORD }, { type: "SYSTEM" });
  return { id, email };
}

async function tokenFor(email: string, password = PASSWORD) {
  const res = await request(app).post(signIn).send({ email, password, device }).expect(200);
  expect(res.body.status).toBe("ok");
  return res.body.token as string;
}

const get = (path: string, token: string) => request(app).get(path).set("Authorization", `Bearer ${token}`);
const post = (path: string, token: string) => request(app).post(path).set("Authorization", `Bearer ${token}`);

function totp(secret: string, at = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const hmac = createHmac("sha1", key).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/** Enrols an account the way the CRM's security page does, and returns the secret its authenticator app would hold. */
async function turnOnAuthenticator(email: string) {
  const web = request.agent(app);
  await web.post("/api/v1/auth/sign-in").set("Origin", CRM).send({ identifier: email, password: PASSWORD, app: "crm" }).expect(200);
  const enabled = await web.post("/api/auth/two-factor/enable").set("Origin", CRM).send({ password: PASSWORD }).expect(200);
  const secret = new URL(enabled.body.totpURI).searchParams.get("secret")!;
  await web
    .post("/api/auth/two-factor/verify-totp")
    .set("Origin", CRM)
    .send({ code: totp(secret) })
    .expect(200);
  return secret;
}

describe("CRM phone app sign-in", () => {
  it("gives a phone a token that works with no cookie, and leaves no web session behind", async () => {
    const exec = await staff("sales_executive");
    const res = await request(app).post(signIn).send({ email: exec.email, password: PASSWORD, device }).expect(200);
    expect(res.body).toMatchObject({ status: "ok", user: { id: exec.id, email: exec.email } });
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(await AuthSession.countDocuments({ userId: exec.id })).toBe(0);
    const stored = (await CrmDevice.findOne({ userId: exec.id }).lean())!;
    expect(stored.tokenHash).not.toBe(res.body.token);
    expect(stored).toMatchObject({ model: "Test Phone", androidVersion: "15", appVersion: "0.1.0" });
    expect((await get("/api/v1/me", res.body.token).expect(200)).body.user.id).toBe(exec.id);
    await get(crmRoutes.leads.path, res.body.token).expect(200);
  });

  it("refuses wrong passwords and accounts that can't use the CRM", async () => {
    const exec = await staff("sales_executive");
    await request(app).post(signIn).send({ email: exec.email, password: "wrong-password", device }).expect(401);
    const finance = await staff("finance");
    const res = await request(app).post(signIn).send({ email: finance.email, password: PASSWORD, device }).expect(403);
    expect(res.body.error.message).toContain("cannot sign in to the CRM");
    expect(await CrmDevice.countDocuments()).toBe(0);
    expect(await AuthSession.countDocuments({ userId: finance.id })).toBe(0);
  });

  it("locks one account after five wrong passwords, even with the right one", async () => {
    const exec = await staff("sales_executive");
    for (let i = 0; i < 5; i += 1)
      await request(app).post(signIn).send({ email: exec.email, password: "wrong-password", device }).expect(401);
    await request(app).post(signIn).send({ email: exec.email, password: PASSWORD, device }).expect(429);
  });

  it("makes a temporary password change first, with no token until then", async () => {
    const admin = await staff("crm_admin");
    const exec = await staff("sales_executive");
    await AuthUser.updateOne({ _id: exec.id }, { $set: { mustChangePassword: true } });
    const first = await request(app).post(signIn).send({ email: exec.email, password: PASSWORD, device }).expect(200);
    expect(first.body).toEqual({ status: "must_change_password" });
    expect(await CrmDevice.countDocuments({ userId: exec.id })).toBe(0);
    const changed = await request(app)
      .post(mobileRoutes.changePassword.path)
      .send({ email: exec.email, password: PASSWORD, newPassword: "NewStaffPass!2026", device })
      .expect(200);
    expect(changed.body.status).toBe("ok");
    expect((await AuthUser.findById(exec.id).lean())!.mustChangePassword).toBe(false);
    await get(crmRoutes.leads.path, changed.body.token).expect(200);
    await request(app).post(signIn).send({ email: exec.email, password: PASSWORD, device }).expect(401);
    expect(admin.id).toBeTruthy();
  });

  it("takes an authenticator code in the same request, with no cookie between the steps", async () => {
    const exec = await staff("sales_executive");
    const secret = await turnOnAuthenticator(exec.email);

    expect((await request(app).post(signIn).send({ email: exec.email, password: PASSWORD, device }).expect(200)).body).toEqual({
      status: "totp_required",
    });
    await request(app).post(signIn).send({ email: exec.email, password: PASSWORD, totp: "000000", device }).expect(401);
    const ok = await request(app)
      .post(signIn)
      .send({ email: exec.email, password: PASSWORD, totp: totp(secret), device })
      .expect(200);
    expect(ok.body.status).toBe("ok");
    await get(crmRoutes.leads.path, ok.body.token).expect(200);
  });

  it("lets a super admin in, and they reach the same screens as anyone else", async () => {
    const admin = await staff("super_admin");
    const token = await tokenFor(admin.email);
    await get(mobileRoutes.today.path, token).expect(200);
    await get(crmRoutes.leads.path, token).expect(200);
  });
});

describe("where admins must use an authenticator app, as on the live server", () => {
  beforeEach(() => {
    vi.stubEnv("REQUIRE_ADMIN_2FA", "true");
    resetEnvForTests();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvForTests();
  });

  it("sends an admin without one to set it up, with no token and no session left behind", async () => {
    const admin = await staff("super_admin");
    const res = await request(app).post(signIn).send({ email: admin.email, password: PASSWORD, device }).expect(403);
    expect(res.body.error.code).toBe("TWO_FACTOR_REQUIRED");
    expect(await CrmDevice.countDocuments({ userId: admin.id })).toBe(0);
    expect(await AuthSession.countDocuments({ userId: admin.id })).toBe(0);
  });

  it("signs an admin with one in by password and code", async () => {
    const admin = await staff("super_admin");
    const secret = await turnOnAuthenticator(admin.email);
    expect((await request(app).post(signIn).send({ email: admin.email, password: PASSWORD, device }).expect(200)).body).toEqual({
      status: "totp_required",
    });
    const ok = await request(app)
      .post(signIn)
      .send({ email: admin.email, password: PASSWORD, totp: totp(secret), device })
      .expect(200);
    expect(ok.body.status).toBe("ok");
    await get(mobileRoutes.today.path, ok.body.token).expect(200);
  });

  it("doesn't ask a sales executive for one", async () => {
    const exec = await staff("sales_executive");
    await get(mobileRoutes.today.path, await tokenFor(exec.email)).expect(200);
  });
});

describe("what a device token can reach", () => {
  it("is 404 without a token, 401 with a bad one, and 404 on anything a phone doesn't use", async () => {
    await request(app).get(crmRoutes.leads.path).expect(404);
    await get(crmRoutes.leads.path, "not-a-real-token").expect(401);
    await get("/api/v1/admin/enrollments", "not-a-real-token").expect(404);

    // The account may do all of this on the web, so only the device list can be what stops it here.
    const owner = await staff("super_admin");
    const token = await tokenFor(owner.email);
    const victim = await staff("sales_executive");
    const blocked: [string, string][] = [
      ["POST", crmRoutes.resetStaffPassword.path.replace(":id", victim.id)],
      ["POST", crmRoutes.createStaff.path],
      ["POST", crmRoutes.saveRole.path],
      ["GET", crmRoutes.leadsCsv.path],
      ["POST", crmRoutes.bulkDelete.path],
      ["POST", crmRoutes.merge.path.replace(":id", victim.id)],
      ["POST", crmRoutes.deleteLead.path.replace(":id", victim.id)],
      ["POST", crmRoutes.saveCommissionSettings.path],
      ["GET", "/api/v1/files/123"],
      ["POST", "/api/v1/files"],
      ["GET", "/api/v1/admin/enrollments"],
      ["GET", "/api/v1/hr/me"],
    ];
    for (const [method, path] of blocked) {
      const res = method === "GET" ? await get(path, token) : await post(path, token).send({});
      expect([path, res.status]).toEqual([path, 404]);
    }
    expect((await StaffProfile.findById(victim.id).lean())!.tempPasswordEnc ?? null).toBeNull();
  });

  it("still lets the Next.js servers through, and a cookie can't change who a phone is", async () => {
    const a = await staff("sales_executive");
    const b = await staff("sales_executive");
    const web = request.agent(app);
    await web.post("/api/v1/auth/sign-in").set("Origin", CRM).send({ identifier: a.email, password: PASSWORD, app: "crm" }).expect(200);
    await web.get(crmRoutes.leads.path).set(INTERNAL).expect(200);
    const token = await tokenFor(b.email);
    const asPhone = await web.get("/api/v1/me").set("Authorization", `Bearer ${token}`).expect(200);
    expect(JSON.stringify(asPhone.body)).toContain(b.email);
    expect(JSON.stringify(asPhone.body)).not.toContain(a.email);
  });
});

describe("cutting a phone off", () => {
  it("signing in on a new phone retires the old one", async () => {
    const exec = await staff("sales_executive");
    const oldToken = await tokenFor(exec.email);
    const newToken = await tokenFor(exec.email);
    await get(crmRoutes.leads.path, oldToken).expect(401);
    await get(crmRoutes.leads.path, newToken).expect(200);
    expect(await CrmDevice.countDocuments({ userId: exec.id, revokedAt: null })).toBe(1);
  });

  it("signing out ends the token", async () => {
    const exec = await staff("sales_executive");
    const token = await tokenFor(exec.email);
    await post(mobileRoutes.signOut.path, token).expect(200);
    await get(crmRoutes.leads.path, token).expect(401);
  });

  it("disabling the account or resetting its password ends the token", async () => {
    const admin = await staff("crm_admin");
    const actor = { type: "USER" as const, id: admin.id };
    const a = await staff("sales_executive");
    const b = await staff("sales_executive");
    const tokenA = await tokenFor(a.email);
    const tokenB = await tokenFor(b.email);
    await setStaffDisabled(a.id, true, actor);
    await get(crmRoutes.leads.path, tokenA).expect(401);
    await resetStaffPassword(b.id, actor);
    await get(crmRoutes.leads.path, tokenB).expect(401);
  });

  it("changing the password on the web ends the token", async () => {
    const exec = await staff("sales_executive");
    const token = await tokenFor(exec.email);
    const web = request.agent(app);
    await web.post("/api/v1/auth/sign-in").set("Origin", CRM).send({ identifier: exec.email, password: PASSWORD, app: "crm" }).expect(200);
    await web
      .post("/api/auth/change-password")
      .set("Origin", CRM)
      .send({ currentPassword: PASSWORD, newPassword: "NewStaffPass!2026" })
      .expect(200);
    await get(crmRoutes.leads.path, token).expect(401);
  });
});
