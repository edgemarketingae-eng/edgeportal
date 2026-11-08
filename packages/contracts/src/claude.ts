import { MCP_CLIENT_KINDS } from "@edge/domain/mcp";
import { z } from "zod";
import { zOk } from "./common";
import { crmRoutes } from "./crm";
import { route, type RouteDef } from "./route";

/**
 * The Claude connector (MCP). Claude itself talks to /mcp and the OAuth endpoints at the API root; these routes are for
 * the CRM web app: the consent page, a person's own connections, and the admin switch. They live under /api/v1/claude,
 * which nginx never exposes and which neither a phone nor Claude may call.
 */
const base = "/api/v1/claude";
const idParam = z.object({ id: z.string().min(1).max(200) });

export const ClaudeConsentDto = z.object({
  /** pending: ask. expired / used: start again from Claude. disabled: the CRM admin turned Claude access off. */
  status: z.enum(["pending", "expired", "used", "disabled"]),
  /** null when the request is gone altogether. `name` is what the app called itself: unverified. */
  client: z.object({ name: z.string().nullable(), kind: z.enum(MCP_CLIENT_KINDS), returnsTo: z.string() }).nullable(),
  you: z.object({ name: z.string(), email: z.string() }),
  canDo: z.array(z.string()),
  cannotDo: z.array(z.string()),
  expiresAt: z.string().nullable(),
});
export type ClaudeConsentDto = z.infer<typeof ClaudeConsentDto>;

export const ClaudeConnectionDto = z.object({
  id: z.string(),
  app: z.string(),
  kind: z.enum(MCP_CLIENT_KINDS),
  readOnly: z.boolean(),
  connectedAt: z.string(),
  lastUsedAt: z.string().nullable(),
  /** Set on the admin list only. */
  user: z.object({ id: z.string(), name: z.string(), email: z.string() }).nullable(),
});
export type ClaudeConnectionDto = z.infer<typeof ClaudeConnectionDto>;

export const ClaudeConnectionsDto = z.object({
  connectorUrl: z.string(),
  enabled: z.boolean(),
  canDo: z.array(z.string()),
  cannotDo: z.array(z.string()),
  connections: z.array(ClaudeConnectionDto),
});
export type ClaudeConnectionsDto = z.infer<typeof ClaudeConnectionsDto>;

export const claudeRoutes = {
  request: route({ method: "GET", path: `${base}/requests/:id`, params: idParam, response: ClaudeConsentDto }),
  approve: route({
    method: "POST",
    path: `${base}/requests/:id/approve`,
    params: idParam,
    body: z.object({ readOnly: z.boolean().default(false) }),
    response: z.object({ redirectUrl: z.string() }),
  }),
  deny: route({ method: "POST", path: `${base}/requests/:id/deny`, params: idParam, response: z.object({ redirectUrl: z.string() }) }),
  connections: route({ method: "GET", path: `${base}/connections`, response: ClaudeConnectionsDto }),
  disconnect: route({ method: "POST", path: `${base}/connections/:id/revoke`, params: idParam, response: zOk }),
  admin: route({
    method: "GET",
    path: `${base}/admin`,
    response: z.object({ enabled: z.boolean(), connectorUrl: z.string(), connections: z.array(ClaudeConnectionDto) }),
  }),
  saveAccess: route({ method: "POST", path: `${base}/access`, body: z.object({ enabled: z.boolean() }), response: zOk }),
};

/**
 * Every CRM route Claude's tools may call for someone; the API answers 404 to the rest. Each still checks the person's
 * own permissions. Kept off on purpose: staff accounts and roles (their rows carry temporary passwords), CSV import and
 * export, the website-forms allowlist (public lead intake) and the task board (the task list covers it). The tool
 * registry in apps/api/src/mcp/tools is checked against this list by a test.
 */
export const mcpRoutes: ReadonlySet<RouteDef> = new Set<RouteDef>([
  crmRoutes.dashboard,
  crmRoutes.options,
  crmRoutes.dueCount,
  crmRoutes.leads,
  crmRoutes.lead,
  crmRoutes.create,
  crmRoutes.update,
  crmRoutes.stage,
  crmRoutes.assign,
  crmRoutes.claim,
  crmRoutes.moveProject,
  crmRoutes.deleteLead,
  crmRoutes.activity,
  crmRoutes.convert,
  crmRoutes.link,
  crmRoutes.resendWelcome,
  crmRoutes.markConversions,
  crmRoutes.removeConversion,
  crmRoutes.merge,
  crmRoutes.bulkAssign,
  crmRoutes.bulkDelete,
  crmRoutes.logDeposit,
  crmRoutes.deposits,
  crmRoutes.verifyDeposit,
  crmRoutes.rejectDeposit,
  crmRoutes.deleteDeposit,
  crmRoutes.commissionSettings,
  crmRoutes.saveCommissionSettings,
  crmRoutes.staffCommission,
  crmRoutes.leaderboard,
  crmRoutes.callReport,
  crmRoutes.removeDevice,
  crmRoutes.products,
  crmRoutes.createProduct,
  crmRoutes.updateProduct,
  crmRoutes.tasks,
  crmRoutes.createTask,
  crmRoutes.task,
  crmRoutes.updateTask,
  crmRoutes.moveTask,
  crmRoutes.completeTask,
  crmRoutes.cancelTask,
  crmRoutes.rescheduleTask,
  crmRoutes.commentTask,
  crmRoutes.projects,
  crmRoutes.createProject,
  crmRoutes.project,
  crmRoutes.updateProject,
  crmRoutes.deleteProject,
  crmRoutes.projectMember,
  crmRoutes.removeProjectMember,
  crmRoutes.settings,
  crmRoutes.saveSettings,
]);
