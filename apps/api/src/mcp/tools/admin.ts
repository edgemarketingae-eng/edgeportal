import { crmRoutes } from "@edge/contracts";
import { z } from "zod";
import { defineTool, zId } from "./kit";

export const getCrmSettings = defineTool({
  name: "get_crm_settings",
  title: "CRM settings",
  description:
    "The CRM's pipeline rules: follow-up SLA (hours to first contact), days until a lead counts as stale, batch urgency " +
    "days, round-robin assignment of website leads, lost reasons and the default project.",
  input: {},
  routes: [crmRoutes.settings],
  perms: ["crm.manage"],
  kind: "read",
  async run(_a, { call }) {
    const s = await call(crmRoutes.settings);
    return {
      followUpSlaHours: s.followUpSlaHours,
      staleAfterDays: s.staleAfterDays,
      batchUrgencyDays: s.batchUrgencyDays,
      roundRobin: s.roundRobin,
      lostReasons: s.lostReasons,
      defaultProject: s.defaultProject,
    };
  },
});

export const updatePipelineRules = defineTool({
  name: "update_pipeline_rules",
  title: "Change the pipeline rules",
  description: "Change any of the CRM's pipeline rules; the others stay as they are. lostReasons replaces the whole list.",
  input: {
    followUpSlaHours: z.number().int().min(1).max(720).optional(),
    staleAfterDays: z.number().int().min(1).max(365).optional(),
    batchUrgencyDays: z.number().int().min(0).max(60).optional(),
    roundRobin: z.boolean().optional().describe("Share new website leads in turn among each project's sales executives"),
    lostReasons: z.array(z.string().trim().min(1).max(120)).min(1).max(50).optional(),
  },
  routes: [crmRoutes.settings, crmRoutes.saveSettings],
  perms: ["crm.manage"],
  kind: "write",
  idempotent: true,
  async run(a, { call }) {
    const s = await call(crmRoutes.settings);
    const next = {
      followUpSlaHours: a.followUpSlaHours ?? s.followUpSlaHours,
      staleAfterDays: a.staleAfterDays ?? s.staleAfterDays,
      batchUrgencyDays: a.batchUrgencyDays ?? s.batchUrgencyDays,
      roundRobin: a.roundRobin ?? s.roundRobin,
      lostReasons: (a.lostReasons ?? s.lostReasons).join("\n"),
    };
    await call(crmRoutes.saveSettings, { body: next });
    return { ok: true, ...next, lostReasons: next.lostReasons.split("\n") };
  },
});

export const removePhone = defineTool({
  name: "remove_phone",
  title: "Remove a phone",
  description: "Sign a lost or replaced phone out of the CRM app (phone ids come from get_call_report). Confirm first.",
  input: { phoneId: zId("Phone") },
  routes: [crmRoutes.removeDevice],
  perms: ["crm.devices.manage"],
  kind: "destructive",
  async run({ phoneId }, { call }) {
    return call(crmRoutes.removeDevice, { params: { id: phoneId } });
  },
});
