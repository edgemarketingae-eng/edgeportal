import { claudeRoutes, crmRoutes, mobileRoutes } from "@edge/contracts";
import { AuthUser, Lead, McpGrant, Project, StaffProfile } from "@edge/db";
import { resetStaffPassword, setStaffDisabled } from "@edge/services";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { TOOLS } from "../src/mcp/tools";
import { closeTestDb, CRM, INTERNAL, resetDb, startApi } from "./helpers";
import { callTool, claudeAccess, connect, listTools, PASSWORD, rpc, staff } from "./mcp-helpers";

type Api = Awaited<ReturnType<typeof startApi>>;
let auth: Api["auth"];
let app: Api["app"];
beforeAll(async () => {
  ({ auth } = await startApi());
});
afterAll(closeTestDb);
beforeEach(async () => {
  await resetDb();
  await claudeAccess(true);
  app = createApp({ auth, logger: false });
});

const general = async () => String((await Project.findOne({ isDefault: true }).lean())!._id);
/** What our /mcp endpoint sends when it calls the API for someone. */
const asClaude = (token: string) => ({ ...INTERNAL, authorization: `Bearer ${token}` });

describe("Claude connector: tools", () => {
  it("offers each person only the tools their role allows", async () => {
    const exec = await staff("sales_executive");
    const admin = await staff("crm_admin");
    const execTools = await listTools(app, (await connect(app, exec.email)).accessToken);
    const adminTools = await listTools(app, (await connect(app, admin.email)).accessToken);

    expect(adminTools).toEqual(TOOLS.map((t) => t.name).sort());
    for (const name of ["whoami", "search_leads", "create_lead", "log_activity", "log_deposit", "create_task", "get_leaderboard"])
      expect(execTools).toContain(name);
    for (const name of [
      "delete_lead",
      "bulk_delete_leads",
      "bulk_assign_leads",
      "merge_leads",
      "verify_deposit",
      "set_commission_rates",
      "create_project",
      "update_project",
      "get_call_report",
      "list_products",
      "get_crm_settings",
      "remove_phone",
    ])
      expect(execTools).not.toContain(name);
  });

  it("marks destructive tools so Claude asks first", async () => {
    const admin = await staff("crm_admin");
    const { accessToken } = await connect(app, admin.email);
    const res = await rpc(app, accessToken, "tools/list").expect(200);
    const byName = new Map((res.body.result.tools as { name: string; annotations: Record<string, boolean> }[]).map((t) => [t.name, t]));
    expect(byName.get("delete_lead")!.annotations).toMatchObject({ destructiveHint: true, readOnlyHint: false });
    expect(byName.get("search_leads")!.annotations).toMatchObject({ readOnlyHint: true });
    expect(byName.get("resend_welcome_email")!.annotations).toMatchObject({ openWorldHint: true });
  });

  it("still lets the API decide: hidden tools fail, and leads outside your projects are not found", async () => {
    const exec = await staff("sales_executive");
    const admin = await staff("crm_admin");
    const { accessToken } = await connect(app, exec.email);

    const hidden = await callTool(app, accessToken, "delete_lead", { leadId: "000000000000000000000000" });
    expect(hidden.isError).toBe(true);

    const other = await Project.create({ name: "Tamil team", code: "TAMIL", managerIds: [admin.id], memberIds: [] });
    const lead = await Lead.create({
      projectId: other._id,
      name: "Not yours",
      phone: "+971509998877",
      source: "WEBSITE",
      ownerId: admin.id,
    });
    const res = await callTool(app, accessToken, "get_lead", { leadId: String(lead._id) });
    expect(res.isError).toBe(true);
    expect(res.text).toContain("outside the projects this person can see");

    const pm = await staff("project_manager");
    const pmToken = (await connect(app, pm.email)).accessToken;
    const upd = await callTool(app, pmToken, "update_project", { projectId: String(other._id), name: "Renamed" });
    expect(upd.isError).toBe(true);
    expect((await Project.findById(other._id).lean())!.name).toBe("Tamil team");
  });

  it("keeps a Claude token to the routes in mcpRoutes, and only through /mcp", async () => {
    const admin = await staff("crm_admin");
    const victim = await staff("sales_executive");
    const { accessToken } = await connect(app, admin.email);

    await request(app).get(crmRoutes.leads.path).set(asClaude(accessToken)).expect(200);
    await request(app).get(crmRoutes.team.path).set(asClaude(accessToken)).expect(404);
    await request(app).post(crmRoutes.resetStaffPassword.path.replace(":id", victim.id)).set(asClaude(accessToken)).expect(404);
    expect((await StaffProfile.findById(victim.id).lean())!.tempPasswordEnc ?? null).toBeNull();
    await request(app).get(crmRoutes.leadsCsv.path).set(asClaude(accessToken)).expect(404);
    await request(app).post(crmRoutes.saveRole.path).set(asClaude(accessToken)).send({ name: "x", permissions: [] }).expect(404);
    await request(app)
      .post(crmRoutes.saveFormOrigins.path)
      .set(asClaude(accessToken))
      .send({ origins: "https://evil.example" })
      .expect(404);
    await request(app).post(crmRoutes.importCsv.path).set(asClaude(accessToken)).send({ csv: "a", projectId: "x" }).expect(404);
    for (const path of ["/api/v1/me", "/api/v1/files", "/api/v1/admin/dashboard", "/api/v1/hr/me", claudeRoutes.connections.path])
      await request(app).get(path).set(asClaude(accessToken)).expect(404);
    await request(app).post(claudeRoutes.saveAccess.path).set(asClaude(accessToken)).send({ enabled: false }).expect(404);

    // Without the internal token (straight from the internet, where /api/v1/crm is public for the phones): nothing.
    await request(app).get(crmRoutes.leads.path).set("authorization", `Bearer ${accessToken}`).expect(404);
    // A phone's token is not a Claude token.
    const phone = await request(app)
      .post(mobileRoutes.signIn.path)
      .send({ email: admin.email, password: PASSWORD, device: { model: "Phone" } })
      .expect(200);
    await rpc(app, phone.body.token, "tools/list").expect(401);
  });

  it("acts as the token's person whatever cookie comes along", async () => {
    const a = await staff("sales_executive");
    const b = await staff("sales_executive");
    const { accessToken } = await connect(app, b.email);
    const webA = request.agent(app);
    await webA.post("/api/v1/auth/sign-in").set("Origin", CRM).send({ identifier: a.email, password: PASSWORD, app: "crm" }).expect(200);
    const res = await webA
      .post(crmRoutes.create.path)
      .set(asClaude(accessToken))
      .send({ projectId: await general(), name: "Whose lead", phone: "+971501234000", source: "WEBSITE" })
      .expect(200);
    expect(String((await Lead.findById(res.body.id).lean())!.ownerId)).toBe(b.id);
  });

  it("gives a read-only connection only read tools, and refuses its writes", async () => {
    const exec = await staff("sales_executive");
    const { accessToken } = await connect(app, exec.email, { readOnly: true });
    const tools = await listTools(app, accessToken);
    const readNames = TOOLS.filter((t) => t.kind === "read").map((t) => t.name);
    expect(tools.every((n) => readNames.includes(n))).toBe(true);
    expect(tools).toContain("search_leads");
    expect(tools).not.toContain("create_lead");
    const res = await request(app)
      .post(crmRoutes.create.path)
      .set(asClaude(accessToken))
      .send({ projectId: await general(), name: "Nope", phone: "+971501234111", source: "WEBSITE" })
      .expect(403);
    expect(res.body.error.message).toContain("read-only");
  });

  it("ends connections when the password changes or is reset, the account is disabled, or someone disconnects", async () => {
    const admin = await staff("crm_admin");
    const actor = { type: "USER" as const, id: admin.id };

    const a = await staff("sales_executive");
    const ca = await connect(app, a.email);
    await ca.agent
      .post("/api/auth/change-password")
      .set("Origin", CRM)
      .send({ currentPassword: PASSWORD, newPassword: "NewStaffPass!2026" })
      .expect(200);
    await rpc(app, ca.accessToken, "tools/list").expect(401);

    const b = await staff("sales_executive");
    const cb = await connect(app, b.email);
    await resetStaffPassword(b.id, actor);
    await rpc(app, cb.accessToken, "tools/list").expect(401);

    const c = await staff("sales_executive");
    const cc = await connect(app, c.email);
    await setStaffDisabled(c.id, true, actor);
    await rpc(app, cc.accessToken, "tools/list").expect(401);

    const d = await staff("sales_executive");
    const cd = await connect(app, d.email);
    const mine = await cd.agent.get(claudeRoutes.connections.path).set(INTERNAL).expect(200);
    expect(mine.body.connections).toHaveLength(1);
    expect(mine.body.connectorUrl).toBe("http://localhost:4000/mcp");
    const grantId = mine.body.connections[0].id as string;

    // Someone else can't see or end it; a CRM admin can.
    const e = await staff("sales_executive");
    const ce = await connect(app, e.email);
    await ce.agent.post(claudeRoutes.disconnect.path.replace(":id", grantId)).set(INTERNAL).expect(404);
    await rpc(app, cd.accessToken, "tools/list").expect(200);
    await cd.agent.post(claudeRoutes.disconnect.path.replace(":id", grantId)).set(INTERNAL).expect(200);
    await rpc(app, cd.accessToken, "tools/list").expect(401);
    expect((await refreshFor(cd.clientId, cd.refreshToken)).body.error).toBe("invalid_grant");

    const adminWeb = (await connect(app, admin.email)).agent;
    const all = await adminWeb.get(claudeRoutes.admin.path).set(INTERNAL).expect(200);
    const eGrant = all.body.connections.find((x: { user: { id: string } }) => x.user.id === e.id);
    await adminWeb.post(claudeRoutes.disconnect.path.replace(":id", eGrant.id)).set(INTERNAL).expect(200);
    await rpc(app, ce.accessToken, "tools/list").expect(401);
    expect((await McpGrant.findById(eGrant.id).lean())!.revokedReason).toBe("revoked");
    expect((await AuthUser.findById(a.id).lean())!.mustChangePassword).toBe(false);
  });

  it("lets only CRM admins switch Claude access", async () => {
    const exec = await staff("sales_executive");
    const admin = await staff("crm_admin");
    const execWeb = (await connect(app, exec.email)).agent;
    await execWeb.post(claudeRoutes.saveAccess.path).set(INTERNAL).send({ enabled: false }).expect(403);
    await execWeb.get(claudeRoutes.admin.path).set(INTERNAL).expect(403);
    const adminWeb = (await connect(app, admin.email)).agent;
    await adminWeb.post(claudeRoutes.saveAccess.path).set(INTERNAL).send({ enabled: false }).expect(200);
    expect((await adminWeb.get(claudeRoutes.admin.path).set(INTERNAL).expect(200)).body.enabled).toBe(false);
  });

  it("limits how fast one connection can call", async () => {
    const exec = await staff("sales_executive");
    const { accessToken } = await connect(app, exec.email);
    let last = 200;
    for (let i = 0; i < 121 && last !== 429; i += 1) last = (await rpc(app, accessToken, "tools/list")).status;
    expect(last).toBe(429);
  });
});

function refreshFor(clientId: string, refreshToken: string) {
  return request(app).post("/token").type("form").send({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId });
}
