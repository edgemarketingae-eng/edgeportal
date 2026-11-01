import { CALL_DIRECTIONS, CALL_OUTCOMES, FOLLOWUP_TYPES } from "@edge/domain/crm/enums";
import { z } from "zod";
import { zEmail, zOk } from "./common";
import { crmRoutes, LeadListItem, TaskDto, zLocalDateTime } from "./crm";
import { meRoutes } from "./me";
import { route, type RouteDef } from "./route";

const base = "/api/v1/mobile";

const DeviceInfo = z.object({
  model: z.string().trim().max(80).optional(),
  androidVersion: z.string().trim().max(20).optional(),
  appVersion: z.string().trim().max(20).optional(),
});

export const MobileSignInInput = z.object({
  email: zEmail(),
  password: z.string().min(1).max(128),
  totp: z.string().trim().max(12).optional(),
  device: DeviceInfo,
});
export type MobileSignInInput = z.infer<typeof MobileSignInInput>;

export const MobileChangePasswordInput = MobileSignInInput.extend({ newPassword: z.string().min(8).max(128) });
export type MobileChangePasswordInput = z.infer<typeof MobileChangePasswordInput>;

export const MobileAuthResult = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), token: z.string(), user: z.object({ id: z.string(), name: z.string(), email: z.string() }) }),
  z.object({ status: z.literal("totp_required") }),
  z.object({ status: z.literal("must_change_password") }),
]);
export type MobileAuthResult = z.infer<typeof MobileAuthResult>;

/** One call log row. Checked row by row in the service: a bad row is skipped, because rejecting the batch would stall the phone's upload. */
export const CallUpload = z.object({
  number: z.string().trim().min(3).max(40),
  countryIso: z.string().trim().max(3).nullish(),
  startedAt: z.number().int().positive(),
  durationSec: z.number().int().min(0).max(86_400),
  direction: z.enum(CALL_DIRECTIONS),
});
export type CallUpload = z.infer<typeof CallUpload>;

export const CallSyncInput = z.object({
  calls: z.array(z.unknown()).max(500),
  trackingOn: z.boolean(),
  appVersion: z.string().trim().max(20).optional(),
});

export const CallSyncResult = z.object({
  stored: z.number(),
  /** New calls on leads this person can see, so the phone can prompt for the outcome or flag a missed call. */
  awaitingSheet: z.array(
    z.object({
      leadId: z.string(),
      leadName: z.string(),
      /** As matched: it can be one of the lead's other numbers, and it's part of what identifies the call. */
      phone: z.string(),
      startedAt: z.number(),
      durationSec: z.number(),
      direction: z.enum(CALL_DIRECTIONS),
    }),
  ),
});
export type CallSyncResult = z.infer<typeof CallSyncResult>;

export const CallSheetInput = CallUpload.extend({
  leadId: z.string().min(1),
  /** No call log row yet (still on the call, or tracking is off): `startedAt` is when the Call button was tapped. */
  estimated: z.boolean().default(false),
  outcome: z.enum(CALL_OUTCOMES),
  body: z.string().trim().max(5000).default(""),
  taskId: z.string().optional(),
  nextFollowUpAt: z.union([z.literal(""), zLocalDateTime]).optional(),
  nextFollowUpTitle: z.string().trim().max(120).optional(),
  nextFollowUpType: z.union([z.literal(""), z.enum(FOLLOWUP_TYPES)]).optional(),
});
export type CallSheetInput = z.input<typeof CallSheetInput>;

export const CallStats = z.object({ calls: z.number(), connected: z.number(), talkSec: z.number() });
export type CallStats = z.infer<typeof CallStats>;

export const MobileToday = z.object({
  tasks: z.array(TaskDto),
  newLeads: z.array(LeadListItem),
  pool: z.array(LeadListItem),
  calls: CallStats,
});
export type MobileToday = z.infer<typeof MobileToday>;

export const mobileRoutes = {
  signIn: route({ method: "POST", path: `${base}/auth/sign-in`, body: MobileSignInInput, response: MobileAuthResult }),
  changePassword: route({
    method: "POST",
    path: `${base}/auth/change-password`,
    body: MobileChangePasswordInput,
    response: MobileAuthResult,
  }),
  signOut: route({ method: "POST", path: `${base}/sign-out`, response: zOk }),
  device: route({ method: "POST", path: `${base}/device`, body: z.object({ fcmToken: z.string().max(4096).nullable() }), response: zOk }),
  syncCalls: route({ method: "POST", path: `${base}/calls/sync`, body: CallSyncInput, response: CallSyncResult }),
  saveCallSheet: route({ method: "POST", path: `${base}/calls/sheet`, body: CallSheetInput, response: zOk }),
  today: route({ method: "GET", path: `${base}/today`, response: MobileToday }),
};

/**
 * Everything a phone's device token may reach; the API answers 404 to the rest. Add to this list deliberately: a device
 * token is on a phone that can be lost, and CRM routes include staff passwords, role changes and bulk deletes. Each route
 * here still checks the signed-in person's own permissions.
 */
export const deviceRoutes: ReadonlySet<RouteDef> = new Set<RouteDef>([
  mobileRoutes.signOut,
  mobileRoutes.device,
  mobileRoutes.syncCalls,
  mobileRoutes.saveCallSheet,
  mobileRoutes.today,
  meRoutes.me,
  meRoutes.notifications,
  crmRoutes.dashboard,
  crmRoutes.options,
  crmRoutes.dueCount,
  crmRoutes.leads,
  crmRoutes.lead,
  crmRoutes.create,
  crmRoutes.update,
  crmRoutes.deleteLead,
  crmRoutes.stage,
  crmRoutes.assign,
  crmRoutes.claim,
  crmRoutes.moveProject,
  crmRoutes.activity,
  crmRoutes.convert,
  crmRoutes.link,
  crmRoutes.resendWelcome,
  crmRoutes.markConversions,
  crmRoutes.removeConversion,
  crmRoutes.logDeposit,
  crmRoutes.deposits,
  crmRoutes.verifyDeposit,
  crmRoutes.rejectDeposit,
  crmRoutes.deleteDeposit,
  crmRoutes.leaderboard,
  crmRoutes.products,
  crmRoutes.tasks,
  crmRoutes.task,
  crmRoutes.createTask,
  crmRoutes.updateTask,
  crmRoutes.moveTask,
  crmRoutes.completeTask,
  crmRoutes.cancelTask,
  crmRoutes.rescheduleTask,
  crmRoutes.commentTask,
  crmRoutes.projects,
  crmRoutes.project,
  crmRoutes.createProject,
  crmRoutes.updateProject,
  crmRoutes.projectMember,
  crmRoutes.removeProjectMember,
]);
