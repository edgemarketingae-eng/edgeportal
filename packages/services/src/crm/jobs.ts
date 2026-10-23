import { AuthUser, Batch, CrmTask, isDuplicateKey, Lead, withTx } from "@edge/db";
import { now } from "@edge/domain/clock";
import { OPEN_LEAD_STAGES, OPEN_TASK_STATUSES } from "@edge/domain/crm/enums";
import { dubaiDateOnly, dubaiDateString, formatDate, startOfDubaiDay } from "@edge/domain/dates";
import { env } from "../env";
import { queueEmail } from "../notifications/email";
import { notifyPermissionHolders, notifyUser } from "../notifications/in-app";
import { flushOutbox } from "../runtime";
import { getSetting } from "../settings";
import { channelToTaskType, leadHref, recomputeNextFollowUp, recordActivity, taskHref } from "./common";

const SYSTEM = { type: "SYSTEM" as const, id: "crm-jobs" };
const OPEN = { $in: [...OPEN_TASK_STATUSES] };

/** Daily 09:00: each assignee gets one in-app note + email listing tasks due today or overdue. Exactly-once per day via the email dedupe key. */
export async function runFollowUpDigest(asOf: Date = now()) {
  const todayEnd = startOfDubaiDay(asOf, 1);
  const todayStart = startOfDubaiDay(asOf);
  const tasks = await CrmTask.find({ status: OPEN, assigneeId: { $ne: null }, dueAt: { $lt: todayEnd } }).sort({ dueAt: 1 }).lean();
  const byAssignee = new Map<string, typeof tasks>();
  for (const t of tasks) {
    const k = String(t.assigneeId);
    byAssignee.set(k, [...(byAssignee.get(k) ?? []), t]);
  }
  const leadIds = [...new Set(tasks.filter((t) => t.leadId).map((t) => String(t.leadId)))];
  const leads = new Map((await Lead.find({ _id: { $in: leadIds } }, { name: 1 }).lean()).map((l) => [String(l._id), l.name]));
  let sent = 0;
  for (const [userId, list] of byAssignee) {
    const user = await AuthUser.findById(userId, { name: 1, email: 1, disabledAt: 1 }).lean();
    if (!user || user.disabledAt) continue;
    const overdue = list.filter((t) => t.dueAt! < todayStart).length;
    const id = await queueEmail({
      to: user.email,
      userId,
      template: "crm.followUpDigest",
      data: {
        name: user.name,
        dueToday: list.length - overdue,
        overdue,
        items: list.slice(0, 25).map((t) => ({ leadName: t.leadId ? (leads.get(String(t.leadId)) ?? "Lead") : "Task", title: t.title, dueAt: t.dueAt!.toISOString(), href: t.leadId ? leadHref(t.leadId) : taskHref(t._id) })),
        tasksUrl: `${env.CRM_APP_URL}/tasks`,
      },
      dedupeKey: `crm-digest:${userId}:${dubaiDateString(asOf)}`,
    });
    if (!id) continue; // already sent today
    sent++;
    await notifyUser(userId, { title: `${list.length} task${list.length === 1 ? "" : "s"} due today`, body: overdue ? `${overdue} overdue.` : "Keep the pipeline moving.", href: `${env.CRM_APP_URL}/tasks` });
  }
  if (sent) await flushOutbox();
  return { owners: byAssignee.size, sent };
}

/** Daily: open leads with no activity for `staleAfterDays` turn COLD; CRM managers get one summary. Idempotent by filter. */
export async function runStaleSweep(asOf: Date = now()) {
  const cfg = await getSetting("crm.config");
  const cutoff = new Date(asOf.getTime() - cfg.staleAfterDays * 86_400_000);
  const r = await Lead.updateMany(
    { mergedIntoId: null, stage: { $in: [...OPEN_LEAD_STAGES] }, temperature: { $ne: "COLD" }, $or: [{ lastActivityAt: { $lt: cutoff } }, { lastActivityAt: null, createdAt: { $lt: cutoff } }] },
    { $set: { temperature: "COLD" } },
  );
  if (r.modifiedCount) {
    await notifyPermissionHolders("crm.all", { title: `${r.modifiedCount} lead${r.modifiedCount === 1 ? "" : "s"} went cold`, body: `No activity for ${cfg.staleAfterDays} days.`, href: `${env.CRM_APP_URL}/leads?temperature=COLD` });
  }
  return { cooled: r.modifiedCount };
}

/**
 * Daily: (1) a batch a lead is interested in starts within `batchUrgencyDays` -> one automatic task per
 * lead in its project (unique autoKey makes this idempotent); (2) a batch closed -> interest rolls to the
 * course's current batch so the lead is not left pointing at the past.
 */
export async function runBatchUrgency(asOf: Date = now()) {
  const cfg = await getSetting("crm.config");
  let tasksCreated = 0;
  let rolled = 0;
  if (cfg.batchUrgencyDays > 0) {
    const upcoming = await Batch.find({ status: { $in: ["OPEN", "RUNNING"] }, startDate: { $gte: dubaiDateOnly(asOf), $lte: dubaiDateOnly(asOf, cfg.batchUrgencyDays) } }).lean();
    for (const b of upcoming) {
      const leads = await Lead.find({ mergedIntoId: null, batchInterestId: b._id, stage: { $in: [...OPEN_LEAD_STAGES] } }).lean();
      for (const lead of leads) {
        const autoKey = `batch-urgency:${b._id}:${lead._id}`;
        try {
          await withTx(async () => {
            const last = await CrmTask.findOne({ projectId: lead.projectId, status: "TODO" }, { order: 1 }).sort({ order: -1 }).lean();
            const [t] = await CrmTask.create([
              {
                projectId: lead.projectId,
                leadId: lead._id,
                assigneeId: lead.ownerId ?? null,
                type: channelToTaskType(lead.preferredChannel),
                priority: "HIGH",
                status: "TODO",
                order: (last?.order ?? -1) + 1,
                title: `${b.name} starts ${formatDate(b.startDate)} — close before it fills`,
                dueAt: asOf,
                autoKey,
              },
            ]);
            await recordActivity(lead._id, "TASK_CREATED", SYSTEM, { data: { taskId: String(t!._id), title: t!.title, type: t!.type, dueAt: asOf.toISOString(), auto: true, batchId: String(b._id) } });
            await recomputeNextFollowUp(lead._id);
          });
          tasksCreated++;
        } catch (e) {
          if (!isDuplicateKey(e)) throw e;
        }
      }
    }
  }
  const closed = await Batch.find({ status: { $in: ["COMPLETED", "ARCHIVED"] } }, { _id: 1, name: 1, courseId: 1 }).lean();
  if (closed.length) {
    const stuck = await Lead.find({ mergedIntoId: null, batchInterestId: { $in: closed.map((b) => b._id) }, stage: { $in: [...OPEN_LEAD_STAGES] } }).lean();
    for (const lead of stuck) {
      const old = closed.find((b) => String(b._id) === String(lead.batchInterestId))!;
      const next = await Batch.findOne({ courseId: old.courseId, isCurrentForEnrollment: true, status: { $in: ["OPEN", "RUNNING"] } }, { _id: 1, name: 1 }).lean();
      await withTx(async () => {
        await Lead.updateOne({ _id: lead._id, batchInterestId: old._id }, { $set: { batchInterestId: next?._id ?? null, lastActivityAt: asOf } });
        await recordActivity(lead._id, "SYSTEM", SYSTEM, { body: next ? `${old.name} closed; interest moved to ${next.name}` : `${old.name} closed; no open batch to move interest to`, data: { fromBatchId: String(old._id), toBatchId: next ? String(next._id) : null } });
      });
      rolled++;
    }
  }
  return { tasksCreated, rolled };
}
