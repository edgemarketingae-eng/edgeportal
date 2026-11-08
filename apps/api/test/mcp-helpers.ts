import { createHash, randomBytes } from "node:crypto";
import { claudeRoutes } from "@edge/contracts";
import { createStaff, invalidateClaudeAccess, setSetting } from "@edge/services";
import request from "supertest";
import { expect } from "vitest";
import { CONSOLE, CRM, INTERNAL } from "./helpers";

/** Helpers for the Claude connector tests: the OAuth dance a Claude client does, then JSON-RPC calls to /mcp. */

type App = Parameters<typeof request>[0];

export const PASSWORD = "StaffPass!2026";
export const LOCAL_REDIRECT = "http://localhost:33418/callback";
export const CLAUDE_REDIRECT = "https://claude.ai/api/mcp/auth_callback";
export const RESOURCE = "http://localhost:4000/mcp";

let seq = 0;
export async function staff(role: string) {
  seq += 1;
  const email = `${role.replace(/_/g, "-")}-${seq}-${Date.now()}@edge.test`;
  const { id } = await createStaff({ name: `${role} ${seq}`, email, roleKeys: [role], password: PASSWORD }, { type: "SYSTEM" });
  return { id, email };
}

export async function claudeAccess(enabled: boolean) {
  await setSetting("crm.claude", { enabled });
  invalidateClaudeAccess();
}

export function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export async function registerClient(app: App, redirect = LOCAL_REDIRECT, name = "Claude Code") {
  const res = await request(app)
    .post("/register")
    .send({
      redirect_uris: [redirect],
      client_name: name,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    })
    .expect(201);
  return res.body.client_id as string;
}

/** GET /authorize like a browser would; returns the consent request id from the redirect to the CRM. */
export async function authorize(
  app: App,
  clientId: string,
  challenge: string,
  opts: { redirect?: string; state?: string; resource?: string } = {},
) {
  const res = await request(app)
    .get("/authorize")
    .query({
      response_type: "code",
      client_id: clientId,
      redirect_uri: opts.redirect ?? LOCAL_REDIRECT,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: opts.state ?? "state-123",
      resource: opts.resource ?? RESOURCE,
      scope: "crm",
    })
    .expect(302);
  const to = new URL(res.headers.location!);
  expect(`${to.origin}${to.pathname}`).toBe(`${CRM}/connect`);
  return to.searchParams.get("request")!;
}

/** A CRM web session (what the Next.js server forwards to the API). */
export async function webAgent(app: App, email: string, signInTo: "crm" | "console" = "crm") {
  const agent = request.agent(app);
  await agent
    .post("/api/v1/auth/sign-in")
    .set("Origin", signInTo === "crm" ? CRM : CONSOLE)
    .send({ identifier: email, password: PASSWORD, app: signInTo })
    .expect(200);
  return agent;
}

export async function approve(agent: ReturnType<typeof request.agent>, requestId: string, readOnly = false) {
  const res = await agent
    .post(claudeRoutes.approve.path.replace(":id", encodeURIComponent(requestId)))
    .set(INTERNAL)
    .send({ readOnly })
    .expect(200);
  const url = new URL(res.body.redirectUrl);
  return { code: url.searchParams.get("code")!, state: url.searchParams.get("state"), url };
}

export async function exchange(app: App, clientId: string, code: string, verifier: string, redirect = LOCAL_REDIRECT) {
  return request(app)
    .post("/token")
    .type("form")
    .send({ grant_type: "authorization_code", code, code_verifier: verifier, client_id: clientId, redirect_uri: redirect });
}

export async function refresh(app: App, clientId: string, refreshToken: string) {
  return request(app).post("/token").type("form").send({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId });
}

/** The whole connect flow for one person; returns their tokens. */
export async function connect(app: App, email: string, opts: { readOnly?: boolean; redirect?: string } = {}) {
  const redirect = opts.redirect ?? LOCAL_REDIRECT;
  const clientId = await registerClient(app, redirect);
  const { verifier, challenge } = pkce();
  const requestId = await authorize(app, clientId, challenge, { redirect });
  const agent = await webAgent(app, email);
  const { code } = await approve(agent, requestId, opts.readOnly);
  const res = await exchange(app, clientId, code, verifier, redirect);
  expect(res.status).toBe(200);
  return {
    clientId,
    agent,
    accessToken: res.body.access_token as string,
    refreshToken: res.body.refresh_token as string,
    body: res.body as Record<string, unknown>,
  };
}

let rpcId = 0;
export function rpc(app: App, token: string, method: string, params: Record<string, unknown> = {}) {
  rpcId += 1;
  return request(app)
    .post("/mcp")
    .set("Authorization", `Bearer ${token}`)
    .set("Accept", "application/json, text/event-stream")
    .set("Content-Type", "application/json")
    .send({ jsonrpc: "2.0", id: rpcId, method, params });
}

export async function listTools(app: App, token: string) {
  const res = await rpc(app, token, "tools/list").expect(200);
  return (res.body.result.tools as { name: string; annotations?: Record<string, unknown> }[]).map((t) => t.name).sort();
}

/** Calls a tool; returns the parsed JSON (or the error text, with isError). */
export async function callTool(app: App, token: string, name: string, args: Record<string, unknown> = {}) {
  const res = await rpc(app, token, "tools/call", { name, arguments: args }).expect(200);
  const result = res.body.result as { isError?: boolean; content: { type: string; text: string }[] };
  const text = result.content[0]?.text ?? "";
  if (result.isError) return { isError: true as const, text, data: null };
  return { isError: false as const, text, data: JSON.parse(text) };
}
