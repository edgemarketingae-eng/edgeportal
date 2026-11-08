import { claudeRoutes } from "@edge/contracts";
import { AuditLog, AuthUser, LeadActivity, McpAuthRequest, McpClient, McpGrant, McpToken, Project } from "@edge/db";
import { freezeClock, setClock } from "@edge/domain/clock";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { closeTestDb, INTERNAL, resetDb, startApi } from "./helpers";
import {
  approve,
  authorize,
  callTool,
  CLAUDE_REDIRECT,
  claudeAccess,
  connect,
  exchange,
  LOCAL_REDIRECT,
  pkce,
  refresh,
  registerClient,
  RESOURCE,
  rpc,
  staff,
  webAgent,
} from "./mcp-helpers";

type Api = Awaited<ReturnType<typeof startApi>>;
let auth: Api["auth"];
let app: Api["app"];
beforeAll(async () => {
  ({ auth } = await startApi());
});
afterAll(closeTestDb);
// A fresh app per test: the sign-in and OAuth rate limits live on the app instance.
beforeEach(async () => {
  await resetDb();
  await claudeAccess(true);
  app = createApp({ auth, logger: false });
});
afterEach(() => setClock(null));

describe("Claude connector: discovery", () => {
  it("answers an unauthenticated /mcp with 401 and where to find the authorization server", async () => {
    const res = await request(app).post("/mcp").send({ jsonrpc: "2.0", id: 1, method: "initialize" }).expect(401);
    expect(res.headers["www-authenticate"]).toContain('resource_metadata="http://localhost:4000/.well-known/oauth-protected-resource/mcp"');

    const prm = await request(app).get("/.well-known/oauth-protected-resource/mcp").expect(200);
    expect(prm.body).toMatchObject({ resource: RESOURCE, authorization_servers: ["http://localhost:4000/"], scopes_supported: ["crm"] });
    await request(app).get("/.well-known/oauth-protected-resource").expect(200);

    const as = await request(app).get("/.well-known/oauth-authorization-server").expect(200);
    expect(as.body).toMatchObject({
      issuer: "http://localhost:4000/",
      authorization_endpoint: "http://localhost:4000/authorize",
      token_endpoint: "http://localhost:4000/token",
      registration_endpoint: "http://localhost:4000/register",
      code_challenge_methods_supported: ["S256"],
    });
  });

  it("registers Claude's own callbacks and loopback apps as public clients, and refuses other redirects", async () => {
    for (const uri of [
      CLAUDE_REDIRECT,
      "https://claude.com/api/mcp/auth_callback",
      "http://127.0.0.1:6274/oauth/callback",
      LOCAL_REDIRECT,
    ]) {
      const res = await request(app)
        .post("/register")
        .send({ redirect_uris: [uri], client_name: "Claude" })
        .expect(201);
      expect(res.body.client_secret).toBeUndefined();
      expect(res.body.token_endpoint_auth_method).toBe("none");
    }
    for (const uri of [
      "https://evil.example/callback",
      "http://claude.ai/api/mcp/auth_callback",
      "https://claude.ai/other",
      "http://192.168.1.5:8080/cb",
    ]) {
      const res = await request(app)
        .post("/register")
        .send({ redirect_uris: [uri] })
        .expect(400);
      expect(res.body.error).toBe("invalid_client_metadata");
    }
    const stored = (await McpClient.findOne({}).lean())!;
    expect(JSON.stringify(stored.info)).not.toContain("client_secret");
  });
});

describe("Claude connector: connecting", () => {
  it("connects a CRM user, and what Claude does is recorded as them, via Claude", async () => {
    const exec = await staff("sales_executive");
    const { accessToken, refreshToken, body } = await connect(app, exec.email);
    expect(accessToken.startsWith("edge_mcp_at_")).toBe(true);
    expect(refreshToken.startsWith("edge_mcp_rt_")).toBe(true);
    expect(body).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "crm" });
    expect(await McpToken.countDocuments({ tokenHash: accessToken })).toBe(0); // only hashes are stored

    const init = await rpc(app, accessToken, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    }).expect(200);
    expect(init.body.result.serverInfo.name).toBe("edge-crm");
    expect(init.body.result.instructions).toContain(`as sales_executive`);

    const me = await callTool(app, accessToken, "whoami");
    expect(me.isError).toBe(false);
    expect(me.data.you).toMatchObject({ id: exec.id, email: exec.email });
    const general = await Project.findOne({ isDefault: true }).lean();
    expect(me.data.projects.map((p: { id: string }) => p.id)).toContain(String(general!._id));

    const created = await callTool(app, accessToken, "create_lead", {
      projectId: String(general!._id),
      name: "Claude Lead",
      phone: "+971501112233",
      source: "WEBSITE",
      tags: ["vip", "dubai"],
    });
    expect(created.isError).toBe(false);
    const leadId = created.data.leadId as string;

    const note = await callTool(app, accessToken, "log_activity", { leadId, type: "NOTE", body: "Asked about the next batch" });
    expect(note.isError).toBe(false);

    const audit = (await AuditLog.findOne({ action: "lead.create", entityId: leadId }).lean())!;
    expect(audit).toMatchObject({ actorType: "USER", actorId: exec.id, via: "CLAUDE" });
    const entry = (await LeadActivity.findOne({ leadId, type: "NOTE" }).lean())!;
    expect(entry).toMatchObject({ actorId: exec.id, via: "CLAUDE" });

    const lead = await callTool(app, accessToken, "get_lead", { leadId });
    expect(lead.data.lead).toMatchObject({ name: "Claude Lead", tags: ["vip", "dubai"] });
    expect(lead.data.timeline.find((t: { type: string }) => t.type === "NOTE")).toMatchObject({ via: "CLAUDE" });

    expect(await AuditLog.countDocuments({ action: "claude.approve", actorId: exec.id })).toBe(1);
    expect(await AuditLog.countDocuments({ action: "claude.connect", actorId: exec.id })).toBe(1);
  });

  it("returns the state on approval and on denial, and a denied request can't be approved", async () => {
    const exec = await staff("sales_executive");
    const clientId = await registerClient(app);
    const { challenge } = pkce();
    const id = await authorize(app, clientId, challenge, { state: "abc" });
    const agent = await webAgent(app, exec.email);

    const consent = await agent.get(claudeRoutes.request.path.replace(":id", id)).set(INTERNAL).expect(200);
    expect(consent.body).toMatchObject({
      status: "pending",
      client: { name: "Claude Code", kind: "LOCAL_APP", returnsTo: "an app on this computer" },
      you: { email: exec.email },
    });
    expect(consent.body.canDo.length).toBeGreaterThan(0);

    const denied = await agent.post(claudeRoutes.deny.path.replace(":id", id)).set(INTERNAL).expect(200);
    const url = new URL(denied.body.redirectUrl);
    expect(url.searchParams.get("error")).toBe("access_denied");
    expect(url.searchParams.get("state")).toBe("abc");
    await agent.post(claudeRoutes.approve.path.replace(":id", id)).set(INTERNAL).send({}).expect(422);
    expect((await agent.get(claudeRoutes.request.path.replace(":id", id)).set(INTERNAL).expect(200)).body.status).toBe("used");
  });

  it("lets an approval through only within 10 minutes", async () => {
    const exec = await staff("sales_executive");
    const clientId = await registerClient(app);
    const { challenge } = pkce();
    const start = new Date(Date.now() + 1000);
    freezeClock(start);
    const id = await authorize(app, clientId, challenge);
    freezeClock(new Date(start.getTime() + 11 * 60_000));
    const agent = await webAgent(app, exec.email);
    expect((await agent.get(claudeRoutes.request.path.replace(":id", id)).set(INTERNAL).expect(200)).body.status).toBe("expired");
    await agent.post(claudeRoutes.approve.path.replace(":id", id)).set(INTERNAL).send({}).expect(422);
  });

  it("checks the PKCE verifier and lets a code be used only once (a replay revokes the connection)", async () => {
    const exec = await staff("sales_executive");
    const clientId = await registerClient(app);
    const { verifier, challenge } = pkce();
    const id = await authorize(app, clientId, challenge);
    const { code } = await approve(await webAgent(app, exec.email), id);

    const wrong = await exchange(app, clientId, code, pkce().verifier);
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toBe("invalid_grant");

    const ok = await exchange(app, clientId, code, verifier);
    expect(ok.status).toBe(200);
    await rpc(app, ok.body.access_token, "tools/list").expect(200);

    const again = await exchange(app, clientId, code, verifier);
    expect(again.body.error).toBe("invalid_grant");
    await rpc(app, ok.body.access_token, "tools/list").expect(401);
    expect((await McpGrant.findOne({}).lean())!.revokedReason).toBe("code_reused");
  });

  it("refuses an authorize for another resource, a foreign redirect or no PKCE", async () => {
    const clientId = await registerClient(app);
    const { challenge } = pkce();
    const bad = await request(app).get("/authorize").query({
      response_type: "code",
      client_id: clientId,
      redirect_uri: LOCAL_REDIRECT,
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource: "https://other.example/mcp",
    });
    expect(bad.status).toBe(302);
    expect(new URL(bad.headers.location!).searchParams.get("error")).toBe("invalid_target");

    await request(app)
      .get("/authorize")
      .query({
        response_type: "code",
        client_id: clientId,
        redirect_uri: "https://evil.example/cb",
        code_challenge: challenge,
        code_challenge_method: "S256",
      })
      .expect(400);

    const noPkce = await request(app).get("/authorize").query({ response_type: "code", client_id: clientId, redirect_uri: LOCAL_REDIRECT });
    expect(new URL(noPkce.headers.location!).searchParams.get("error")).toBe("invalid_request");
    expect(await McpAuthRequest.countDocuments()).toBe(0);
  });

  it("rotates refresh tokens, and an old one used again ends the connection", async () => {
    const exec = await staff("sales_executive");
    const c = await connect(app, exec.email);
    const first = await refresh(app, c.clientId, c.refreshToken);
    expect(first.status).toBe(200);
    expect(first.body.refresh_token).not.toBe(c.refreshToken);
    await rpc(app, first.body.access_token, "tools/list").expect(200);

    // Reused within the grace window (two tabs refreshing at once): still fine.
    expect((await refresh(app, c.clientId, c.refreshToken)).status).toBe(200);

    freezeClock(new Date(Date.now() + 2 * 60_000));
    const reused = await refresh(app, c.clientId, c.refreshToken);
    expect(reused.body.error).toBe("invalid_grant");
    setClock(null);
    await rpc(app, first.body.access_token, "tools/list").expect(401);
    expect((await refresh(app, c.clientId, first.body.refresh_token)).body.error).toBe("invalid_grant");
  });

  it("expires access tokens after an hour", async () => {
    const exec = await staff("sales_executive");
    const c = await connect(app, exec.email);
    freezeClock(new Date(Date.now() + 61 * 60_000));
    await rpc(app, c.accessToken, "tools/list").expect(401);
    setClock(null);
    await rpc(app, c.accessToken, "tools/list").expect(200);
  });

  it("asks for a password change or two-factor first, and refuses people without the CRM", async () => {
    const clientId = await registerClient(app);
    const { challenge } = pkce();

    const exec = await staff("sales_executive");
    const agent = await webAgent(app, exec.email);
    await AuthUser.updateOne({ _id: exec.id }, { $set: { mustChangePassword: true } });
    const id1 = await authorize(app, clientId, challenge);
    const r1 = await agent.post(claudeRoutes.approve.path.replace(":id", id1)).set(INTERNAL).send({}).expect(403);
    expect(r1.body.error.code).toBe("MUST_CHANGE_PASSWORD");

    const finance = await staff("finance");
    const fa = await webAgent(app, finance.email, "console");
    const id2 = await authorize(app, clientId, challenge);
    await fa.post(claudeRoutes.approve.path.replace(":id", id2)).set(INTERNAL).send({}).expect(403);
  });

  it("is paused while CRM admins have Claude access switched off", async () => {
    const exec = await staff("sales_executive");
    const c = await connect(app, exec.email);
    await claudeAccess(false);
    const res = await rpc(app, c.accessToken, "tools/list").expect(401);
    expect(res.headers["www-authenticate"]).toContain("turned off");
    const clientId = await registerClient(app);
    const id = await authorize(app, clientId, pkce().challenge);
    const agent = await webAgent(app, exec.email);
    expect((await agent.get(claudeRoutes.request.path.replace(":id", id)).set(INTERNAL).expect(200)).body.status).toBe("disabled");
    await agent.post(claudeRoutes.approve.path.replace(":id", id)).set(INTERNAL).send({}).expect(422);

    await claudeAccess(true);
    await rpc(app, c.accessToken, "tools/list").expect(200);
  });
});
