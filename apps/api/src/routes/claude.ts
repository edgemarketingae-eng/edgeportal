import { claudeRoutes } from "@edge/contracts";
import {
  approveMcpAuthorization,
  CLAUDE_CANNOT_DO,
  claudeAccessEnabled,
  claudeCanDo,
  denyMcpAuthorization,
  env,
  getMcpAuthorization,
  listMcpConnections,
  revokeMcpConnection,
  setClaudeAccess,
} from "@edge/services";
import { Router } from "express";
import { clientIp } from "../http/context";
import { actorOf, requirePermission } from "../http/guards";
import { register } from "../http/route";

const connectorUrl = () => `${env.API_PUBLIC_URL.replace(/\/+$/, "")}/mcp`;

/**
 * The CRM side of the Claude connector: the consent page, a person's own connections and the admin switch. Every route
 * needs a signed-in CRM user (so two-factor and password-change rules apply), and none is reachable by a phone or by
 * Claude itself (they aren't in `deviceRoutes` or `mcpRoutes`, and /api/v1/claude isn't exposed by nginx).
 */
export function claudeRouter() {
  const r = Router();
  register(r, claudeRoutes.request, async (req) => getMcpAuthorization(req.valid.params.id, requirePermission(req, "crm.access")));
  register(r, claudeRoutes.approve, async (req) =>
    approveMcpAuthorization(req.valid.params.id, requirePermission(req, "crm.access"), req.valid.body, {
      ip: clientIp(req),
      userAgent: req.header("x-forwarded-user-agent") ?? req.header("user-agent") ?? null,
    }),
  );
  register(r, claudeRoutes.deny, async (req) => denyMcpAuthorization(req.valid.params.id, requirePermission(req, "crm.access")));
  register(r, claudeRoutes.connections, async (req) => {
    const v = requirePermission(req, "crm.access");
    return {
      connectorUrl: connectorUrl(),
      enabled: await claudeAccessEnabled(),
      canDo: claudeCanDo(v.permissions),
      cannotDo: CLAUDE_CANNOT_DO,
      connections: await listMcpConnections({ userId: v.userId }),
    };
  });
  register(r, claudeRoutes.disconnect, async (req) => {
    const v = requirePermission(req, "crm.access");
    await revokeMcpConnection(req.valid.params.id, actorOf(v), { any: v.permissions.has("crm.manage") });
    return { ok: true as const, message: "Claude disconnected." };
  });
  register(r, claudeRoutes.admin, async (req) => {
    requirePermission(req, "crm.access", "crm.manage");
    return { enabled: await claudeAccessEnabled(), connectorUrl: connectorUrl(), connections: await listMcpConnections() };
  });
  register(r, claudeRoutes.saveAccess, async (req) => {
    const v = requirePermission(req, "crm.access", "crm.manage");
    await setClaudeAccess(req.valid.body.enabled, actorOf(v));
    return { ok: true as const, message: req.valid.body.enabled ? "CRM users can connect Claude." : "Claude access is off." };
  });
  return r;
}
