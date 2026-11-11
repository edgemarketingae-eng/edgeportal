import { CallUpload, type CallReportDto, type CallSheetInput, type CallStats, type CallSyncResult } from "@edge/contracts";
import {
  CrmDevice,
  CrmTask,
  isDuplicateKey,
  Lead,
  LeadActivity,
  LeadCall,
  Project,
  Types,
  withTx,
  type CrmDeviceDoc,
  type LeadActivityDoc,
  type LeadCallDoc,
  type LeadDoc,
} from "@edge/db";
import { now } from "@edge/domain/clock";
import {
  CONNECTED_MIN_SEC,
  OPEN_LEAD_STAGES,
  OPEN_TASK_STATUSES,
  type CallDirection,
  type CallOutcome,
  type CallReportPeriod,
  type FollowUpType,
} from "@edge/domain/crm/enums";
import { startOfDubaiDay } from "@edge/domain/dates";
import type { Actor } from "@edge/domain/enums";
import { parsePhone } from "@edge/domain/phone";
import { audit, viaOf } from "../audit";
import { NotFoundError, ValidationError } from "../errors";
import {
  between,
  callTouchPatch,
  createTaskInTx,
  dayRange,
  hasDays,
  loadLead,
  localDate,
  lockLead,
  optId,
  periodRange,
  recomputeNextFollowUp,
  recordActivity,
  userNames,
} from "./common";
import { salesExecutiveIds } from "./leaderboard";
import { canSeeLead, canSeeTask, has, managesProject, type CrmScope } from "./scope";

type UserActor = Actor & { type: "USER" };

/** A phone that hasn't reported for this long has probably stopped tracking, whatever it last said. */
const SILENT_AFTER_MS = 24 * 60 * 60 * 1000;

/** How far an estimated call and its call log row can sit apart: the row starts around the tap and can land after a long call. */
const ESTIMATE_BEFORE_MS = 2 * 60_000;
const ESTIMATE_AFTER_MS = 30 * 60_000;

const wholeSecond = (ms: number) => new Date(Math.floor(ms / 1000) * 1000);
const isConnected = (durationSec: number, outcome: string | null) =>
  outcome ? outcome === "ANSWERED" || outcome === "CALLBACK" : durationSec >= CONNECTED_MIN_SEC;

interface CallFacts {
  userId: Types.ObjectId;
  phone: string;
  direction: CallDirection;
  startedAt: Date;
  durationSec: number;
  estimated: boolean;
  leadId: Types.ObjectId;
}

interface CallSheet {
  outcome: CallOutcome;
  body: string;
  taskId?: Types.ObjectId | null;
  dueAt: Date | null;
  followUpTitle?: string;
  followUpType?: FollowUpType;
}

/**
 * The same call seen before. An exact hit is the usual case. Otherwise a call log row looks for an estimated call saved
 * from the sheet, and an estimated sheet looks for a row that got here first.
 */
async function findCall(c: CallFacts) {
  const exact = await LeadCall.findOne({ userId: c.userId, phone: c.phone, startedAt: c.startedAt }).lean();
  if (exact) return exact as LeadCallDoc;
  const at = c.startedAt.getTime();
  const near = c.estimated
    ? { sheetSavedAt: null, startedAt: { $gte: new Date(at - ESTIMATE_BEFORE_MS), $lte: new Date(at + ESTIMATE_AFTER_MS) } }
    : { estimated: true, startedAt: { $gte: new Date(at - ESTIMATE_AFTER_MS), $lte: new Date(at + ESTIMATE_BEFORE_MS) } };
  // The closest one: an old estimate from a dial that was cancelled must not swallow a later real call.
  const closest = { startedAt: c.estimated ? 1 : -1 } as const;
  return (await LeadCall.findOne({ userId: c.userId, phone: c.phone, ...near })
    .sort(closest)
    .lean()) as LeadCallDoc | null;
}

async function closeTaskForCall(lead: LeadDoc, taskId: Types.ObjectId, at: Date, actor: UserActor, scope: CrmScope) {
  const task = await CrmTask.findOne({ _id: taskId, leadId: lead._id, status: { $in: [...OPEN_TASK_STATUSES] } }).lean();
  if (!task || !canSeeTask(task, scope)) return;
  await CrmTask.updateOne({ _id: task._id }, { $set: { status: "DONE", completedAt: at, completedById: new Types.ObjectId(actor.id) } });
  await recordActivity(lead._id, "TASK_DONE", actor, { data: { taskId: String(task._id), title: task.title, type: task.type } });
  await audit({ actor, action: "task.complete", entityType: "CrmTask", entityId: String(task._id) });
}

/**
 * Upload and after-call sheet both land here, in either order and as often as the phone retries, and leave one call
 * with one timeline entry. The entry is never edited, so the timeline stays append-only: the outcome and note live on the
 * LeadCall and are read back by `withCallDetails`.
 */
async function saveCall(c: CallFacts, actor: UserActor, scope: CrmScope, sheet?: CallSheet) {
  const write = () =>
    withTx(async () => {
      const existing = await findCall(c);
      const lead = await lockLead(existing?.leadId ?? c.leadId);
      const at = now();
      const applySheet = !!sheet && !existing?.sheetSavedAt;
      const outcome = applySheet ? sheet.outcome : ((existing?.outcome as CallOutcome | null | undefined) ?? null);
      const durationSec = Math.max(existing?.durationSec ?? 0, c.durationSec);
      const connected = isConnected(durationSec, outcome);
      // A real call log row outranks an estimate of the same call; an estimate never overwrites a real row.
      const keepExisting = !!existing && (!existing.estimated || c.estimated);
      const startedAt = keepExisting ? existing.startedAt : c.startedAt;
      const direction = keepExisting ? (existing.direction as CallDirection) : c.direction;

      let callId: Types.ObjectId;
      if (existing) {
        callId = existing._id;
        await LeadCall.updateOne(
          { _id: callId },
          {
            $set: {
              startedAt,
              direction,
              durationSec,
              connected,
              estimated: !!existing.estimated && c.estimated,
              ...(applySheet ? { outcome, body: sheet.body || null, sheetSavedAt: at } : {}),
            },
          },
        );
      } else {
        const [call] = await LeadCall.create([
          {
            userId: c.userId,
            leadId: lead._id,
            projectId: lead.projectId,
            phone: c.phone,
            direction,
            startedAt,
            durationSec,
            connected,
            estimated: c.estimated,
            ...(applySheet ? { outcome, body: sheet.body || null, sheetSavedAt: at } : {}),
          },
        ]);
        callId = call!._id;
        await LeadActivity.create([
          {
            leadId: lead._id,
            type: "CALL",
            direction: direction === "OUT" ? "OUT" : "IN",
            callId,
            actorType: actor.type,
            actorId: actor.id,
            via: viaOf(actor),
            createdAt: startedAt,
          },
        ]);
        await audit({ actor, action: "lead.call", entityType: "Lead", entityId: String(lead._id), after: { direction, durationSec } });
      }

      const { set, autoStage } = callTouchPatch(lead, { startedAt, direction, connected });
      if (Object.keys(set).length) await Lead.updateOne({ _id: lead._id }, { $set: set });
      if (autoStage) await recordActivity(lead._id, "STAGE_CHANGED", actor, { data: { from: lead.stage, to: autoStage, auto: true } });

      if (applySheet) {
        if (sheet.taskId) await closeTaskForCall(lead, sheet.taskId, at, actor, scope);
        if (sheet.dueAt)
          await createTaskInTx(
            { projectId: lead.projectId, leadId: lead._id, defaultAssigneeId: lead.ownerId ?? null },
            { title: sheet.followUpTitle || "Follow up", type: sheet.followUpType ?? "CALL", dueAt: sheet.dueAt },
            actor,
          );
        await recomputeNextFollowUp(lead._id);
        await audit({ actor, action: "lead.call.outcome", entityType: "Lead", entityId: String(lead._id), after: { outcome } });
      }
      return { leadId: lead._id, created: !existing };
    });
  // Two first saves of one call can both miss `findCall`; the loser's retry then finds the winner's row.
  try {
    return await write();
  } catch (e) {
    if (!isDuplicateKey(e)) throw e;
    return write();
  }
}

/** The lead a number belongs to when several share it: duplicates are a normal state. */
function bestLead(leads: LeadDoc[], scope: CrmScope) {
  const rank = (l: LeadDoc) => [
    l.ownerId?.equals(scope.me) ? 0 : 1,
    canSeeLead(l, scope) ? 0 : 1,
    (OPEN_LEAD_STAGES as readonly string[]).includes(l.stage) ? 0 : 1,
    -(l.lastActivityAt?.getTime() ?? 0),
  ];
  return [...leads].sort((a, b) => {
    const [x, y] = [rank(a), rank(b)];
    const i = x.findIndex((v, n) => v !== y[n]);
    return i < 0 ? 0 : x[i]! - y[i]!;
  })[0];
}

/**
 * Stores the calls that belong to a lead and drops the rest, which are never saved or logged: company phones carry
 * personal calls too. Matching ignores scope on purpose, or a call uploaded after a reassignment would be lost, but only
 * leads this person can see are named in the reply.
 */
export async function syncCalls(rows: unknown[], actor: UserActor, scope: CrmScope): Promise<CallSyncResult> {
  const calls = rows.flatMap((row) => {
    const parsed = CallUpload.safeParse(row);
    if (!parsed.success) return [];
    const phone = parsePhone(parsed.data.number, parsed.data.countryIso)?.e164;
    return phone ? [{ ...parsed.data, phone, startedAt: wholeSecond(parsed.data.startedAt) }] : [];
  });
  if (!calls.length) return { stored: 0, awaitingSheet: [] };
  const phones = [...new Set(calls.map((c) => c.phone))];
  const [leads, known] = await Promise.all([
    Lead.find({ mergedIntoId: null, $or: [{ phone: { $in: phones } }, { altPhones: { $in: phones } }] }).lean() as unknown as Promise<
      LeadDoc[]
    >,
    LeadCall.find(
      { userId: scope.me, phone: { $in: phones }, startedAt: { $in: calls.map((c) => c.startedAt) } },
      { phone: 1, startedAt: 1, durationSec: 1 },
    ).lean(),
  ]);
  // The phone re-reads recent hours on every run, so most rows are already here; skipping them avoids locking the lead.
  const seen = new Map(known.map((k) => [`${k.phone}|${k.startedAt.getTime()}`, k.durationSec ?? 0]));
  let stored = 0;
  const awaitingSheet: CallSyncResult["awaitingSheet"] = [];
  for (const c of calls) {
    const lead = bestLead(
      leads.filter((l) => l.phone === c.phone || l.altPhones?.includes(c.phone)),
      scope,
    );
    if (!lead) continue;
    stored += 1;
    const prior = seen.get(`${c.phone}|${c.startedAt.getTime()}`);
    if (prior !== undefined && prior >= c.durationSec) continue;
    const { created, leadId } = await saveCall(
      {
        userId: scope.me,
        phone: c.phone,
        direction: c.direction,
        startedAt: c.startedAt,
        durationSec: c.durationSec,
        estimated: false,
        leadId: lead._id,
      },
      actor,
      scope,
    );
    if (created && leadId.equals(lead._id) && canSeeLead(lead, scope))
      awaitingSheet.push({
        leadId: String(lead._id),
        leadName: lead.name,
        phone: c.phone,
        startedAt: c.startedAt.getTime(),
        durationSec: c.durationSec,
        direction: c.direction,
      });
  }
  return { stored, awaitingSheet };
}

/** The after-call sheet. Works with or without a call log row; see `findCall`. */
export async function saveCallSheet(input: CallSheetInput, actor: UserActor, scope: CrmScope) {
  let lead = await loadLead(input.leadId, scope);
  if (lead.mergedIntoId) lead = await loadLead(lead.mergedIntoId);
  const phone = parsePhone(input.number, input.countryIso)?.e164 ?? lead.phone;
  if (!phone) throw new ValidationError({ number: "This lead has no number to attach the call to" });
  const dueAt = localDate(input.nextFollowUpAt, "nextFollowUpAt");
  await saveCall(
    {
      userId: scope.me,
      phone,
      direction: input.direction,
      startedAt: wholeSecond(input.startedAt),
      durationSec: input.durationSec,
      estimated: !!input.estimated,
      leadId: lead._id,
    },
    actor,
    scope,
    {
      outcome: input.outcome,
      body: input.body?.trim() ?? "",
      taskId: optId(input.taskId),
      dueAt,
      followUpTitle: input.nextFollowUpTitle?.trim() || undefined,
      followUpType: (input.nextFollowUpType as FollowUpType) || undefined,
    },
  );
}

/** Fills tracked calls in on the timeline, which holds only a reference to them. */
export async function withCallDetails(activities: LeadActivityDoc[]): Promise<LeadActivityDoc[]> {
  const ids = activities.flatMap((a) => (a.callId ? [a.callId] : []));
  if (!ids.length) return activities;
  const calls = await LeadCall.find({ _id: { $in: ids } }).lean();
  const byId = new Map(calls.map((c) => [String(c._id), c]));
  return activities.map((a) => {
    const c = a.callId ? byId.get(String(a.callId)) : undefined;
    if (!c) return a;
    return {
      ...a,
      outcome: c.outcome,
      body: c.body,
      data: { tracked: true, durationSec: c.durationSec, callDirection: c.direction, connected: c.connected },
    };
  });
}

export async function callStats(userId: Types.ObjectId, from: Date): Promise<CallStats> {
  const [row] = await LeadCall.aggregate<CallStats>([
    { $match: { userId, startedAt: { $gte: from } } },
    {
      $group: {
        _id: null,
        calls: { $sum: 1 },
        connected: { $sum: { $cond: ["$connected", 1, 0] } },
        talkSec: { $sum: "$durationSec" },
      },
    },
  ]);
  return { calls: row?.calls ?? 0, connected: row?.connected ?? 0, talkSec: row?.talkSec ?? 0 };
}

export const callStatsToday = (userId: Types.ObjectId) => callStats(userId, startOfDubaiDay(now()));

function phoneStatus(device: Pick<CrmDeviceDoc, "trackingOn" | "lastSyncAt">) {
  if (device.trackingOn === false) return "off" as const;
  const synced = device.lastSyncAt?.getTime();
  return synced && now().getTime() - synced < SILENT_AFTER_MS ? ("tracking" as const) : ("silent" as const);
}

function reportRange(period: CallReportPeriod, at: Date) {
  if (period === "today") return { from: startOfDubaiDay(at), to: null };
  if (period === "week") return { from: startOfDubaiDay(at, -6), to: null };
  return periodRange(period, at);
}

/**
 * Calls per person for a period (Dubai calendar). Everyone who should be calling is listed, so someone at zero stands out.
 * Project managers see calls on their projects; phone status is only for people who can act on it.
 */
export async function getCallReport(
  q: { period?: CallReportPeriod; project?: string; from?: string; to?: string },
  scope: CrmScope,
): Promise<CallReportDto> {
  const projectId = optId(q.project);
  if (projectId && !managesProject(scope, projectId)) throw new NotFoundError("Project");
  const { from, to } = hasDays(q) ? dayRange(q.from, q.to) : reportRange(q.period ?? "today", now());
  const projects = projectId ? [projectId] : scope.all ? null : scope.managed;
  const startedAt = between(from, to);
  const match = { ...(projects ? { projectId: { $in: projects } } : {}), ...(startedAt ? { startedAt } : {}) };
  const rows = await LeadCall.aggregate<{
    _id: Types.ObjectId;
    calls: number;
    connected: number;
    talkSec: number;
    leads: Types.ObjectId[];
  }>([
    { $match: match },
    {
      $group: {
        _id: "$userId",
        calls: { $sum: 1 },
        connected: { $sum: { $cond: ["$connected", 1, 0] } },
        talkSec: { $sum: "$durationSec" },
        leads: { $addToSet: "$leadId" },
      },
    },
  ]);
  const team = projects
    ? (await Project.find({ _id: { $in: projects } }, { memberIds: 1 }).lean()).flatMap((p) => p.memberIds.map(String))
    : await salesExecutiveIds();
  const ids = [...new Set([...team, ...rows.map((r) => String(r._id))])];
  const canManageDevices = has(scope, "crm.devices.manage");
  const [names, devices] = await Promise.all([
    userNames(ids),
    canManageDevices ? CrmDevice.find({ userId: { $in: ids.map((id) => new Types.ObjectId(id)) }, revokedAt: null }).lean() : [],
  ]);
  const deviceOf = new Map(devices.map((d) => [String(d.userId), d]));
  const statsOf = new Map(rows.map((r) => [String(r._id), r]));
  return {
    canManageDevices,
    totals: {
      calls: rows.reduce((sum, r) => sum + r.calls, 0),
      connected: rows.reduce((sum, r) => sum + r.connected, 0),
      talkSec: rows.reduce((sum, r) => sum + r.talkSec, 0),
    },
    rows: ids
      .map((id) => {
        const stats = statsOf.get(id);
        const device = deviceOf.get(id);
        return {
          userId: id,
          name: names.get(id) ?? "Unknown",
          calls: stats?.calls ?? 0,
          connected: stats?.connected ?? 0,
          talkSec: stats?.talkSec ?? 0,
          leads: stats?.leads.length ?? 0,
          device: device
            ? {
                id: String(device._id),
                model: device.model ?? null,
                appVersion: device.appVersion ?? null,
                lastSyncAt: device.lastSyncAt?.toISOString() ?? null,
                status: phoneStatus(device),
              }
            : null,
        };
      })
      .sort((a, b) => b.talkSec - a.talkSec || b.calls - a.calls || a.name.localeCompare(b.name)),
  };
}

/** Keeps a merged lead's calls and numbers on the survivor, so later calls to the old number still find it (joins the transaction). */
export async function moveCallsOnMerge(from: Pick<LeadDoc, "_id" | "phone" | "altPhones">, into: Pick<LeadDoc, "_id" | "phone">) {
  await LeadCall.updateMany({ leadId: from._id }, { $set: { leadId: into._id } });
  const numbers = [from.phone, ...(from.altPhones ?? [])].filter((n): n is string => !!n && n !== into.phone);
  if (numbers.length) await Lead.updateOne({ _id: into._id }, { $addToSet: { altPhones: { $each: numbers } } });
}
