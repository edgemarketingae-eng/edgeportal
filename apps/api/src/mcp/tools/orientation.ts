import { crmRoutes } from "@edge/contracts";
import {
  CALL_OUTCOMES,
  CALL_REPORT_PERIODS,
  CRM_TASK_STATUSES,
  DEPOSIT_SEQUENCES,
  DEPOSIT_STATUSES,
  EXPERIENCE_LEVELS,
  FOLLOWUP_TYPES,
  LEAD_CHANNELS,
  LEAD_LANGUAGES,
  LEAD_SOURCES,
  LEAD_STAGES,
  LEAD_TEMPERATURES,
  LEAD_TOUCH_TYPES,
  LEADERBOARD_PERIODS,
  PROJECT_STATUSES,
  TASK_PRIORITIES,
} from "@edge/domain/crm/enums";
import { now } from "@edge/domain/clock";
import { ACADEMY_TZ, toDubaiLocal } from "@edge/domain/dates";
import { claudeCanDo } from "@edge/services";
import { z } from "zod";
import { defineTool, zDays, zId } from "./kit";

const weekday = (d: Date) => new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: ACADEMY_TZ }).format(d);

export const whoami = defineTool({
  name: "whoami",
  title: "Who am I in the CRM",
  description:
    "Start here. Who you are acting as in the Edge Academy CRM, what this person may do, the current Dubai date and time, " +
    "and the ids other tools need: projects (with who can be assigned leads in each), staff, products, courses, batches " +
    "and lost reasons, plus the allowed values for stages, sources, task statuses and so on.",
  input: {},
  routes: [crmRoutes.options, crmRoutes.dueCount],
  perms: [],
  kind: "read",
  async run(_args, { viewer, readOnly, call }) {
    const at = now();
    const base = {
      you: { id: viewer.userId, name: viewer.user.name, email: viewer.user.email },
      connection: readOnly ? "read-only: you can look things up but not change anything" : "you can make changes as this person",
      mayDo: claudeCanDo(viewer.permissions),
      now: `${toDubaiLocal(at)} (${weekday(at)})`,
      timeZone: "Asia/Dubai (UTC+4). Every date and time you send or receive is Dubai local time, YYYY-MM-DDTHH:mm.",
    };
    if (!viewer.permissions.has("crm.read")) return base;
    const [o, due] = await Promise.all([call(crmRoutes.options), call(crmRoutes.dueCount)]);
    return {
      ...base,
      tasksDueTodayOrOverdue: due.count,
      projects: o.projects.map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        isDefault: p.isDefault,
        canAssignOthers: p.canAssign,
        team: (o.teams[p.id] ?? []).map((s) => ({ id: s.id, name: s.name, ...(s.available === false ? { off: true } : {}) })),
      })),
      ...(o.staff.length ? { staff: o.staff.map((s) => ({ id: s.id, name: s.name, roles: s.roles })) } : {}),
      products: o.products,
      courses: o.courses,
      batches: o.batches,
      lostReasons: o.lostReasons,
      values: {
        leadStages: LEAD_STAGES,
        leadSources: LEAD_SOURCES,
        temperatures: LEAD_TEMPERATURES,
        languages: LEAD_LANGUAGES,
        channels: LEAD_CHANNELS,
        experienceLevels: EXPERIENCE_LEVELS,
        activityTypes: LEAD_TOUCH_TYPES,
        callOutcomes: CALL_OUTCOMES,
        taskStatuses: CRM_TASK_STATUSES,
        taskPriorities: TASK_PRIORITIES,
        followUpTypes: FOLLOWUP_TYPES,
        projectStatuses: PROJECT_STATUSES,
        depositSequences: DEPOSIT_SEQUENCES,
        depositStatuses: DEPOSIT_STATUSES,
        leaderboardPeriods: LEADERBOARD_PERIODS,
        callReportPeriods: CALL_REPORT_PERIODS,
      },
    };
  },
});

export const getDashboard = defineTool({
  name: "get_dashboard",
  title: "CRM dashboard",
  description:
    "The CRM dashboard for the leads this person can see: open leads by stage, new today and this week, leads not contacted " +
    "within the follow-up SLA, overdue and due-today tasks, conversions and losses this month, 90-day win rate, results by " +
    "source, project and owner, and their own open tasks.",
  input: {
    projectId: zId("Project").optional().describe("Limit to one project"),
    ...zDays,
    allTime: z.boolean().optional().describe("Period figures over all time (without from/to they cover this month)"),
  },
  routes: [crmRoutes.dashboard],
  perms: ["crm.read"],
  kind: "read",
  async run({ projectId, from, to, allTime }, { call }) {
    const d = await call(crmRoutes.dashboard, {
      query: { project: projectId, from, to, ...(allTime && !from && !to ? { period: "all" as const } : {}) },
    });
    return { ...d, myTasks: d.myTasks.slice(0, 20).map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt, lead: t.leadName })) };
  },
});

export const getLeaderboard = defineTool({
  name: "get_leaderboard",
  title: "Sales leaderboard",
  description:
    "Sales leaderboard: conversions (per product), new leads, conversion rate and verified deposits per person, plus this " +
    "person's own figures. Commission appears only for people who manage commission.",
  input: {
    period: z.enum(LEADERBOARD_PERIODS).optional().describe("Default month (this calendar month in Dubai)"),
    projectId: zId("Project").optional(),
    ...zDays,
  },
  routes: [crmRoutes.leaderboard],
  perms: ["crm.read"],
  kind: "read",
  async run({ period, projectId, from, to }, { call }) {
    return call(crmRoutes.leaderboard, { query: { period, project: projectId, from, to } });
  },
});

export const getCallReport = defineTool({
  name: "get_call_report",
  title: "Phone call report",
  description:
    "Calls tracked by the CRM phone app per person: calls, connected calls, talk time (seconds) and leads called. People who " +
    "manage phones also see each person's phone (its id is what remove_phone takes) and whether tracking is on.",
  input: { period: z.enum(CALL_REPORT_PERIODS).optional().describe("Default today"), projectId: zId("Project").optional(), ...zDays },
  routes: [crmRoutes.callReport],
  perms: ["crm.calls.read"],
  kind: "read",
  async run({ period, projectId, from, to }, { call }) {
    return call(crmRoutes.callReport, { query: { period, project: projectId, from, to } });
  },
});
