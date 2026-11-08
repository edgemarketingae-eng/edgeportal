import type { ClaudeConnectionDto } from "@edge/contracts";
import { AuthUser, McpAuthRequest, McpGrant, McpToken, Types, type McpGrantDoc } from "@edge/db";
import { now } from "@edge/domain/clock";
import type { Actor } from "@edge/domain/enums";
import { audit } from "../audit";
import { env } from "../env";
import { NotFoundError } from "../errors";
import { oid } from "../ids";
import { iso } from "../mappers";
import { revokeGrant } from "./oauth";

const APP_NAMES = { CLAUDE_APP: "Claude", LOCAL_APP: "Claude on a computer", OTHER: "Other app" } as const;

/** A connection Claude hasn't used for longer than a refresh token lives can't come back, so it isn't listed. */
const liveFilter = () => ({
  revokedAt: null,
  lastUsedAt: { $gte: new Date(now().getTime() - env.MCP_REFRESH_TOKEN_DAYS * 24 * 3600_000) },
});

function toDto(g: McpGrantDoc, user: { id: string; name: string; email: string } | null): ClaudeConnectionDto {
  return {
    id: String(g._id),
    app: g.clientName?.trim() || APP_NAMES[g.kind],
    kind: g.kind,
    readOnly: !!g.readOnly,
    connectedAt: iso(g.createdAt)!,
    lastUsedAt: iso(g.lastUsedAt),
    user,
  };
}

/** Live connections: one person's (their own page) or everyone's (CRM Settings). */
export async function listMcpConnections(opts: { userId?: string } = {}): Promise<ClaudeConnectionDto[]> {
  const filter = { ...liveFilter(), ...(opts.userId ? { userId: new Types.ObjectId(opts.userId) } : {}) };
  const grants = (await McpGrant.find(filter).sort({ lastUsedAt: -1 }).limit(500).lean()) as McpGrantDoc[];
  if (opts.userId) return grants.map((g) => toDto(g, null));
  const users = await AuthUser.find({ _id: { $in: [...new Set(grants.map((g) => String(g.userId)))] } }, { name: 1, email: 1 }).lean();
  const byId = new Map(users.map((u) => [String(u._id), { id: String(u._id), name: u.name, email: u.email }]));
  return grants.map((g) => toDto(g, byId.get(String(g.userId)) ?? { id: String(g.userId), name: "Deleted user", email: "" }));
}

/** Disconnect: your own connection, or anyone's for a CRM admin (`any`). Someone else's id is "not found". */
export async function revokeMcpConnection(id: string, actor: Actor & { type: "USER" }, opts: { any: boolean }) {
  const g = await McpGrant.findOne({ _id: oid(id, "Connection"), revokedAt: null }).lean();
  if (!g || (!opts.any && String(g.userId) !== actor.id)) throw new NotFoundError("Connection");
  const mine = String(g.userId) === actor.id;
  await revokeGrant(g._id, mine ? "disconnected" : "revoked", actor.id);
  await audit({
    actor,
    action: "claude.disconnect",
    entityType: "McpGrant",
    entityId: String(g._id),
    after: { userId: String(g.userId), clientName: g.clientName ?? null },
  });
}

/** Called whenever someone's password changes or their account is disabled (joins a surrounding transaction). */
export async function revokeMcpGrants(userId: string | Types.ObjectId, reason: string) {
  const _id = oid(userId, "User");
  const at = now();
  await McpGrant.updateMany({ userId: _id, revokedAt: null }, { $set: { revokedAt: at, revokedReason: reason } });
  await McpToken.deleteMany({ userId: _id });
}

/** A deleted staff account takes its Claude connections with it. */
export async function purgeMcpUser(userId: Types.ObjectId) {
  await McpToken.deleteMany({ userId });
  await McpGrant.deleteMany({ userId });
  await McpAuthRequest.deleteMany({ userId });
}
