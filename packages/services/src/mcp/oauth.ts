import type { ClaudeConsentDto } from "@edge/contracts";
import { McpAuthRequest, McpClient, McpGrant, McpToken, Types, withTx, type McpGrantDoc } from "@edge/db";
import { isCrmPermission, PERMISSIONS, type Permission } from "@edge/domain/auth/permissions";
import { now } from "@edge/domain/clock";
import { isMcpAccessToken, MCP_ACCESS_PREFIX, MCP_CODE_PREFIX, MCP_REFRESH_PREFIX } from "@edge/domain/mcp";
import { audit } from "../audit";
import { loadViewer, type Viewer } from "../auth/viewer";
import { env } from "../env";
import { BusinessError, NotFoundError } from "../errors";
import { iso } from "../mappers";
import { hashToken, newToken } from "../tokens";
import { claudeAccessEnabled } from "./access";
import { isAllowedRedirect, redirectKind, returnsTo } from "./redirects";

/** An OAuth protocol error; the API turns `code` into the matching OAuth error response. */
export class McpOAuthError extends Error {
  constructor(
    readonly code: "invalid_client_metadata" | "invalid_request" | "invalid_grant" | "invalid_target",
    message: string,
  ) {
    super(message);
  }
}

const MINUTE = 60_000;
const PENDING_MS = 10 * MINUTE;
const CODE_MS = 5 * MINUTE;
/** An approved request is kept this long after its code is issued, so a replayed code is recognised (and punished). */
const KEEP_USED_MS = 24 * 60 * MINUTE;
const UNUSED_CLIENT_MS = 24 * 60 * MINUTE;
/** Two refreshes racing each other (two Claude tabs) both succeed within this window; later reuse means theft. */
const REFRESH_GRACE_MS = MINUTE;
const SEEN_EVERY_MS = 5 * MINUTE;
export const MCP_SCOPE = "crm";

/** Things Claude can never do here, whatever the person's role. Shown on the consent and Connect Claude pages. */
export const CLAUDE_CANNOT_DO = [
  "Create, change or delete staff accounts and roles",
  "See or reset passwords",
  "Import or export CSV files",
  "Change which websites may post leads",
  "Connect or disconnect Claude, or turn Claude access on or off",
];

/** The person's CRM permissions in words (minus the ones Claude can't use). */
export function claudeCanDo(perms: Set<Permission>): string[] {
  const skip = new Set<Permission>(["crm.access", "crm.staff.manage", "crm.roles.manage"]);
  return [...perms].filter((p) => isCrmPermission(p) && !skip.has(p)).map((p) => PERMISSIONS[p]);
}

const clip = (s: unknown, n: number) => (typeof s === "string" && s.trim() ? s.trim().slice(0, n) : null);
const minutesFromNow = (ms: number) => new Date(now().getTime() + ms);

/** A Claude user is a working CRM user: not disabled, holds crm.access, has no pending password change. */
async function usableViewer(userId: string): Promise<Viewer | null> {
  const v = await loadViewer(userId);
  return v && !v.user.disabledAt && !v.user.mustChangePassword && v.permissions.has("crm.access") ? v : null;
}

// ─── Clients (dynamic client registration) ──────────────────────────────────────────────────────────────────────────

export interface McpClientInfo {
  client_id: string;
  redirect_uris: string[];
  client_name?: string;
  [key: string]: unknown;
}

/**
 * Stores a client Claude registered for itself. Every redirect must be on the allowlist, and the client is always public
 * (no secret): the code can only be used with the PKCE verifier, at an address we trust.
 */
export async function registerMcpClient<T extends McpClientInfo>(info: T): Promise<T> {
  const uris = info.redirect_uris ?? [];
  if (!uris.length) throw new McpOAuthError("invalid_client_metadata", "At least one redirect_uri is required");
  const bad = uris.find((u) => !isAllowedRedirect(String(u)));
  if (bad) throw new McpOAuthError("invalid_client_metadata", `Redirect URI not allowed: ${bad}`);
  const stored = JSON.parse(
    JSON.stringify({ ...info, client_secret: undefined, client_secret_expires_at: undefined, token_endpoint_auth_method: "none" }),
  ) as T;
  await McpClient.create({
    _id: info.client_id,
    name: clip(info.client_name, 100),
    redirectUris: uris,
    info: stored,
    unusedExpiresAt: minutesFromNow(UNUSED_CLIENT_MS),
  });
  return stored;
}

export async function getMcpClient(clientId: string): Promise<McpClientInfo | undefined> {
  const c = await McpClient.findById(clientId).lean();
  return c ? (c.info as McpClientInfo) : undefined;
}

// ─── Authorization (the consent page) ───────────────────────────────────────────────────────────────────────────────

export async function startMcpAuthorization(p: {
  clientId: string;
  redirectUri: string;
  state?: string;
  codeChallenge: string;
  scopes?: string[];
  resource?: string;
}): Promise<string> {
  if (!isAllowedRedirect(p.redirectUri)) throw new McpOAuthError("invalid_request", "Redirect URI not allowed");
  if (p.state && p.state.length > 2048) throw new McpOAuthError("invalid_request", "state is too long");
  const publicId = newToken();
  await McpAuthRequest.create({
    publicId,
    clientId: p.clientId,
    redirectUri: p.redirectUri,
    state: p.state ?? null,
    codeChallenge: p.codeChallenge,
    scopes: (p.scopes ?? []).slice(0, 10),
    resource: p.resource ?? null,
    expiresAt: minutesFromNow(PENDING_MS),
  });
  return publicId;
}

function withParams(uri: string, params: Record<string, string | null | undefined>) {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v);
  return u.toString();
}

export async function getMcpAuthorization(publicId: string, v: Viewer): Promise<ClaudeConsentDto> {
  const r = await McpAuthRequest.findOne({ publicId }).lean();
  const you = { name: v.user.name, email: v.user.email };
  const base = { you, canDo: claudeCanDo(v.permissions), cannotDo: CLAUDE_CANNOT_DO };
  if (!r) return { ...base, status: "expired", client: null, expiresAt: null };
  const client = await McpClient.findById(r.clientId, { name: 1 }).lean();
  const status =
    r.status !== "PENDING" ? "used" : r.expiresAt <= now() ? "expired" : !(await claudeAccessEnabled()) ? "disabled" : ("pending" as const);
  return {
    ...base,
    status,
    client: { name: client?.name ?? null, kind: redirectKind(r.redirectUri), returnsTo: returnsTo(r.redirectUri) },
    expiresAt: iso(r.expiresAt),
  };
}

/** The person said yes: issue a one-time code bound to them, and send their browser back to Claude with it. */
export async function approveMcpAuthorization(
  publicId: string,
  v: Viewer,
  opts: { readOnly: boolean },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<{ redirectUrl: string }> {
  if (!(await claudeAccessEnabled())) throw new BusinessError("Claude access to the CRM is turned off. Ask your CRM admin.");
  const code = newToken(MCP_CODE_PREFIX);
  const at = now();
  const r = await McpAuthRequest.findOneAndUpdate(
    { publicId, status: "PENDING", expiresAt: { $gt: at } },
    {
      $set: {
        status: "APPROVED",
        userId: new Types.ObjectId(v.userId),
        readOnly: opts.readOnly,
        codeHash: hashToken(code),
        codeExpiresAt: new Date(at.getTime() + CODE_MS),
        expiresAt: new Date(at.getTime() + KEEP_USED_MS),
      },
    },
    { returnDocument: "after" },
  ).lean();
  if (!r) throw new BusinessError("This request has expired or was already used. Start connecting again from Claude.");
  if (!isAllowedRedirect(r.redirectUri)) throw new BusinessError("Claude can't be sent back to that address any more.");
  const client = await McpClient.findOneAndUpdate(
    { _id: r.clientId },
    { $set: { lastAuthorizedAt: at, unusedExpiresAt: null } },
    { returnDocument: "after" },
  ).lean();
  await audit({
    actor: { type: "USER", id: v.userId },
    action: "claude.approve",
    entityType: "McpClient",
    entityId: r.clientId,
    after: { clientName: client?.name ?? null, readOnly: opts.readOnly, returnsTo: returnsTo(r.redirectUri) },
    ip: ctx.ip ?? null,
    userAgent: ctx.userAgent ?? null,
  });
  return { redirectUrl: withParams(r.redirectUri, { code, state: r.state }) };
}

/** No (or "Back to Claude" from an expired page): Claude learns the person declined. */
export async function denyMcpAuthorization(publicId: string, v: Viewer): Promise<{ redirectUrl: string }> {
  const r = await McpAuthRequest.findOne({ publicId }).lean();
  if (!r) throw new NotFoundError("Request");
  if (r.status === "PENDING")
    await McpAuthRequest.updateOne({ _id: r._id, status: "PENDING" }, { $set: { status: "DENIED", userId: new Types.ObjectId(v.userId) } });
  return {
    redirectUrl: withParams(r.redirectUri, {
      error: "access_denied",
      error_description: "The CRM user did not allow access",
      state: r.state,
    }),
  };
}

// ─── Tokens ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface McpTokens {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

async function issueTokens(grant: Pick<McpGrantDoc, "_id" | "userId" | "clientId">): Promise<McpTokens> {
  const access = newToken(MCP_ACCESS_PREFIX);
  const refresh = newToken(MCP_REFRESH_PREFIX);
  const accessMs = env.MCP_ACCESS_TOKEN_MINUTES * MINUTE;
  const base = { grantId: grant._id, userId: grant.userId, clientId: grant.clientId };
  await McpToken.insertMany([
    { ...base, kind: "ACCESS", tokenHash: hashToken(access), expiresAt: minutesFromNow(accessMs) },
    { ...base, kind: "REFRESH", tokenHash: hashToken(refresh), expiresAt: minutesFromNow(env.MCP_REFRESH_TOKEN_DAYS * 24 * 60 * MINUTE) },
  ]);
  return { access_token: access, token_type: "Bearer", expires_in: Math.floor(accessMs / 1000), refresh_token: refresh, scope: MCP_SCOPE };
}

/** The PKCE challenge for a code (checked by the OAuth library before the exchange). */
export async function challengeForMcpCode(clientId: string, code: string): Promise<string> {
  const r = await McpAuthRequest.findOne({ codeHash: hashToken(code), clientId }, { codeChallenge: 1 }).lean();
  if (!r) throw new McpOAuthError("invalid_grant", "Invalid authorization code");
  return r.codeChallenge;
}

/** Code → tokens, once. This is where the connection is created; a replayed code revokes the connection it made. */
export async function exchangeMcpCode(p: { clientId: string; code: string; redirectUri?: string }): Promise<McpTokens> {
  const codeHash = hashToken(p.code);
  const at = now();
  const r = await McpAuthRequest.findOneAndUpdate(
    { codeHash, clientId: p.clientId, status: "APPROVED", codeExpiresAt: { $gt: at } },
    { $set: { status: "USED" } },
  ).lean();
  if (!r) {
    const used = await McpAuthRequest.findOne({ codeHash, clientId: p.clientId, status: "USED" }, { grantId: 1 }).lean();
    if (used?.grantId) await revokeGrant(used.grantId, "code_reused");
    throw new McpOAuthError("invalid_grant", "Invalid or expired authorization code");
  }
  if (p.redirectUri && p.redirectUri !== r.redirectUri) throw new McpOAuthError("invalid_grant", "redirect_uri does not match");
  if (!(await claudeAccessEnabled())) throw new McpOAuthError("invalid_grant", "Claude access to the CRM is turned off");
  const v = r.userId ? await usableViewer(String(r.userId)) : null;
  if (!v) throw new McpOAuthError("invalid_grant", "This CRM account can't connect Claude");
  const client = await McpClient.findById(r.clientId, { name: 1 }).lean();
  const userId = new Types.ObjectId(v.userId);
  return withTx(async () => {
    // One live connection per person per Claude app: reconnecting replaces the old one.
    const old = await McpGrant.find({ userId, clientId: r.clientId, revokedAt: null }, { _id: 1 }).lean();
    for (const g of old) await revokeGrant(g._id, "replaced");
    const [grant] = await McpGrant.create([
      {
        userId,
        clientId: r.clientId,
        clientName: client?.name ?? null,
        kind: redirectKind(r.redirectUri),
        scopes: [MCP_SCOPE],
        readOnly: !!r.readOnly,
        lastUsedAt: at,
      },
    ]);
    await McpAuthRequest.updateOne({ _id: r._id }, { $set: { grantId: grant!._id } });
    await audit({
      actor: { type: "USER", id: v.userId },
      action: "claude.connect",
      entityType: "McpGrant",
      entityId: String(grant!._id),
      after: { clientName: client?.name ?? null, readOnly: !!r.readOnly },
    });
    return issueTokens(grant!);
  });
}

/** Refresh tokens rotate: each one works once. Using an old one again (after a short grace) revokes the connection. */
export async function refreshMcpTokens(p: { clientId: string; refreshToken: string }): Promise<McpTokens> {
  const at = now();
  const t = await McpToken.findOne({ tokenHash: hashToken(p.refreshToken), kind: "REFRESH", clientId: p.clientId }).lean();
  if (!t || t.expiresAt <= at) throw new McpOAuthError("invalid_grant", "Invalid or expired refresh token");
  const grant = await McpGrant.findOne({ _id: t.grantId, revokedAt: null }).lean();
  if (!grant) throw new McpOAuthError("invalid_grant", "This connection was disconnected");
  const claimed = await McpToken.findOneAndUpdate({ _id: t._id, usedAt: null }, { $set: { usedAt: at } }).lean();
  if (!claimed) {
    const usedAt = (await McpToken.findById(t._id, { usedAt: 1 }).lean())?.usedAt;
    if (!usedAt || at.getTime() - usedAt.getTime() > REFRESH_GRACE_MS) {
      await revokeGrant(grant._id, "refresh_reused");
      throw new McpOAuthError("invalid_grant", "Refresh token was already used");
    }
  }
  if (!(await claudeAccessEnabled())) throw new McpOAuthError("invalid_grant", "Claude access to the CRM is turned off");
  if (!(await usableViewer(String(grant.userId)))) throw new McpOAuthError("invalid_grant", "This CRM account can't use Claude");
  await McpGrant.updateOne({ _id: grant._id }, { $set: { lastUsedAt: at } });
  return issueTokens(grant);
}

/** RFC 7009: revoking a refresh token ends the whole connection; an access token just stops working. */
export async function revokeMcpToken(p: { clientId: string; token: string }) {
  const t = await McpToken.findOne({ tokenHash: hashToken(p.token), clientId: p.clientId }).lean();
  if (!t) return;
  if (t.kind === "REFRESH") await revokeGrant(t.grantId, "revoked_by_app");
  else await McpToken.deleteOne({ _id: t._id });
}

export interface McpAccess {
  grantId: string;
  userId: string;
  clientId: string;
  readOnly: boolean;
  scopes: string[];
  expiresAt: Date;
}

/**
 * Who a Claude access token acts for: null if it isn't one of ours (or has expired, or its connection was disconnected),
 * "off" while Claude access is switched off in CRM Settings. The caller still loads and checks the person.
 */
export async function verifyMcpAccess(token: string): Promise<McpAccess | "off" | null> {
  if (!isMcpAccessToken(token)) return null;
  const t = await McpToken.findOne({ tokenHash: hashToken(token), kind: "ACCESS" }).lean();
  const at = now();
  if (!t || t.expiresAt <= at) return null;
  const grant = await McpGrant.findOne({ _id: t.grantId, revokedAt: null }).lean();
  if (!grant) return null;
  if (!(await claudeAccessEnabled())) return "off";
  if (!grant.lastUsedAt || at.getTime() - grant.lastUsedAt.getTime() >= SEEN_EVERY_MS)
    await McpGrant.updateOne({ _id: grant._id }, { $set: { lastUsedAt: at } });
  return {
    grantId: String(grant._id),
    userId: String(grant.userId),
    clientId: grant.clientId,
    readOnly: !!grant.readOnly,
    scopes: grant.scopes ?? [],
    expiresAt: t.expiresAt,
  };
}

/** Ends a connection: its tokens are deleted, the grant is kept (revoked) so it stays in the record. */
export async function revokeGrant(grantId: Types.ObjectId | string, reason: string, byId?: string | null) {
  const _id = new Types.ObjectId(String(grantId));
  await McpGrant.updateOne(
    { _id, revokedAt: null },
    { $set: { revokedAt: now(), revokedReason: reason, revokedById: byId ? new Types.ObjectId(byId) : null } },
  );
  await McpToken.deleteMany({ grantId: _id });
}
