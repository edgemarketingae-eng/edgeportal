import {
  CrmProduct,
  CrmTask,
  Lead,
  LeadActivity,
  LeadCall,
  LeadConversion,
  LeadDeposit,
  PayrollMonth,
  Project,
  TaskComment,
  type CrmProductDoc,
  type CrmTaskDoc,
  type LeadActivityDoc,
  type LeadCallDoc,
  type LeadDepositDoc,
  type TaskCommentDoc,
  type Types,
} from "@edge/db";
import { now } from "@edge/domain/clock";
import { depositMonthRange } from "@edge/domain/crm/commission";
import { DEPOSIT_SEQUENCE_LABELS } from "@edge/domain/crm/labels";
import { formatDate, formatDateTime } from "@edge/domain/dates";
import { formatMonth, type Month } from "@edge/domain/hr/calendar";
import { formatMoney } from "@edge/domain/money";
import { notifyUser } from "../notifications/in-app";
import { getSetting } from "../settings";
import { LEAD_CONTACT_TYPES, LEAD_TOUCH_TYPES } from "@edge/domain/crm/enums";
import { ACTIVITY_LABELS } from "@edge/domain/crm/labels";
import { NotFoundError } from "../errors";
import { oid } from "../ids";
import { auditDelete, crmUrl, deleter, gather, Plan, snapshot } from "../records/kit";
import { leadHref, recomputeNextFollowUp, recordActivity } from "./common";
import { rerateLaterMonth } from "./deposits";
import { DEFAULT_PRODUCTS } from "./products";

/** A task and its comments; a lead's next follow-up moves to its next open task. */
export const taskDeleter = deleter<CrmTaskDoc>({
  load: async (id) => {
    const t = await CrmTask.findById(oid(id, "Task")).lean();
    if (!t) throw new NotFoundError("Task");
    return t as CrmTaskDoc;
  },
  plan: async (t) => {
    const p = new Plan(`the task ${t.title}`);
    p.remove(await TaskComment.countDocuments({ taskId: t._id }), "comment");
    if (t.autoKey) p.warn("It was created automatically, so it may be created again.");
    return p;
  },
  apply: async (t, actor) => {
    const comments = await TaskComment.find({ taskId: t._id }).lean();
    await TaskComment.deleteMany({ taskId: t._id });
    await CrmTask.deleteOne({ _id: t._id });
    if (t.leadId) await recomputeNextFollowUp(t.leadId);
    await auditDelete({
      actor,
      action: "task.delete",
      entityType: "CrmTask",
      entityId: String(t._id),
      before: snapshot({ ...t, comments }),
    });
  },
  done: (t) => `Task ${t.title} deleted.`,
});

export const taskCommentDeleter = deleter<TaskCommentDoc>({
  load: async (id) => {
    const c = await TaskComment.findById(oid(id, "Comment")).lean();
    if (!c) throw new NotFoundError("Comment");
    return c as TaskCommentDoc;
  },
  plan: async () => new Plan("this comment"),
  apply: async (c, actor) => {
    await TaskComment.deleteOne({ _id: c._id });
    await auditDelete({ actor, action: "task.comment.delete", entityType: "TaskComment", entityId: String(c._id), before: snapshot(c) });
  },
  done: () => "Comment deleted.",
});

const isTouch = (type: string) => (LEAD_TOUCH_TYPES as readonly string[]).includes(type);
const isContact = (type: string) => (LEAD_CONTACT_TYPES as readonly string[]).includes(type);
const sameTime = (a: Date | null | undefined, b: Date) => !!a && a.getTime() === b.getTime();

/**
 * After a touch is deleted, the lead's contact dates that came from it fall back to the latest (or first) remaining
 * touch: logged entries by their time, tracked calls by when they started (an outgoing or connected call counts).
 */
async function rewindContactDates(leadId: Types.ObjectId, at: Date, contact: boolean) {
  const lead = await Lead.findById(leadId, { firstContactedAt: 1, lastContactedAt: 1, lastActivityAt: 1 }).lean();
  if (!lead) return;
  const touches = { leadId, type: { $in: [...LEAD_TOUCH_TYPES] } };
  const contacts = { leadId, type: { $in: [...LEAD_CONTACT_TYPES] } };
  const calls = { leadId, $or: [{ direction: "OUT" as const }, { connected: true }] };
  const latest = async (dir: 1 | -1) => {
    const [a, c] = [
      await LeadActivity.findOne({ ...contacts, callId: null }, { createdAt: 1 })
        .sort({ createdAt: dir })
        .lean(),
      await LeadCall.findOne(calls, { startedAt: 1 }).sort({ startedAt: dir }).lean(),
    ];
    const times = [a?.createdAt, c?.startedAt].filter((x): x is Date => !!x).map((d) => d.getTime());
    if (!times.length) return null;
    return new Date(dir === -1 ? Math.max(...times) : Math.min(...times));
  };
  const set: Record<string, Date | null> = {};
  if (sameTime(lead.lastActivityAt, at))
    set.lastActivityAt = (await LeadActivity.findOne(touches, { createdAt: 1 }).sort({ createdAt: -1 }).lean())?.createdAt ?? null;
  if (contact && sameTime(lead.lastContactedAt, at)) set.lastContactedAt = await latest(-1);
  if (contact && sameTime(lead.firstContactedAt, at)) set.firstContactedAt = await latest(1);
  if (Object.keys(set).length) await Lead.updateOne({ _id: leadId }, { $set: set });
}

/**
 * A note, call, WhatsApp, email or meeting logged on a lead. Pipeline history (stage changes, assignments) stays, and
 * so do entries made by the call tracker (delete the call instead). Contact dates that came from this entry move back.
 */
export const leadActivityDeleter = deleter<LeadActivityDoc>({
  load: async (id) => {
    const a = await LeadActivity.findById(oid(id, "Timeline entry")).lean();
    if (!a) throw new NotFoundError("Timeline entry");
    return a as LeadActivityDoc;
  },
  plan: async (a) => {
    const p = new Plan(`this ${(ACTIVITY_LABELS[a.type] ?? "timeline entry").toLowerCase()}`);
    if (!isTouch(a.type)) p.block("Pipeline history (stage changes, assignments, conversions) can't be deleted");
    if (a.callId) p.block("It belongs to a tracked call. Delete the call instead");
    p.warn("The lead's stage doesn't change.");
    return p;
  },
  apply: async (a, actor) => {
    await LeadActivity.deleteOne({ _id: a._id });
    await rewindContactDates(a.leadId, a.createdAt, isContact(a.type));
    await auditDelete({ actor, action: "lead.activity.delete", entityType: "LeadActivity", entityId: String(a._id), before: snapshot(a) });
  },
  done: () => "Timeline entry deleted.",
});

/** A product nobody converted to. Starting products come back with every update, so those are archived instead. */
export const productDeleter = deleter<CrmProductDoc>({
  load: async (id) => {
    const pr = await CrmProduct.findById(oid(id, "Product")).lean();
    if (!pr) throw new NotFoundError("Product");
    return pr as CrmProductDoc;
  },
  plan: async (pr) => {
    const p = new Plan(`the product ${pr.name}`);
    const [conversions] = await gather([() => LeadConversion.countDocuments({ productId: pr._id })] as const);
    p.blockIf(
      conversions,
      "conversion uses it. Archive it instead",
      "conversions use it. Archive it instead",
      crmUrl(`/leads?product=${pr._id}&view=all`),
    );
    if (pr.isStudentCourse) p.block("It's the product recorded when a lead becomes a student");
    if (DEFAULT_PRODUCTS.some((d) => d.code === pr.code))
      p.block("It's one of the starting products, which come back with every update. Archive it instead");
    return p;
  },
  apply: async (pr, actor) => {
    await Lead.updateMany({ productIds: pr._id }, { $pull: { productIds: pr._id } });
    await Project.updateMany({ productIds: pr._id }, { $pull: { productIds: pr._id } });
    await CrmProduct.deleteOne({ _id: pr._id });
    await auditDelete({ actor, action: "product.delete", entityType: "CrmProduct", entityId: String(pr._id), before: snapshot(pr) });
  },
  done: (pr) => `${pr.name} deleted.`,
});

/** Phones send calls from the hours before their last sync again; older calls don't come back. */
const CALL_RESEND_MS = 24 * 3600_000;

/** A tracked call and its timeline entry; contact dates that came from it move back. */
export const callDeleter = deleter<LeadCallDoc>({
  load: async (id) => {
    const c = await LeadCall.findById(oid(id, "Call")).lean();
    if (!c) throw new NotFoundError("Call");
    return c as LeadCallDoc;
  },
  plan: async (c) => {
    const p = new Plan(`the call on ${formatDateTime(c.startedAt)}`);
    if (now().getTime() - c.startedAt.getTime() < CALL_RESEND_MS)
      p.block(`The phone may send this call again. Delete it after ${formatDateTime(new Date(c.startedAt.getTime() + CALL_RESEND_MS))}`);
    p.remove(await LeadActivity.countDocuments({ callId: c._id }), "timeline entry", "timeline entries");
    p.warn("The lead's stage doesn't change.");
    return p;
  },
  apply: async (c, actor) => {
    await LeadActivity.deleteMany({ callId: c._id });
    await LeadCall.deleteOne({ _id: c._id });
    await rewindContactDates(c.leadId, c.startedAt, c.direction === "OUT" || c.connected);
    await auditDelete({ actor, action: "lead.call.delete", entityType: "LeadCall", entityId: String(c._id), before: snapshot(c) });
  },
  done: () => "Call deleted.",
});

/** The salary month (Dubai calendar) a deposit's commission is paid in. */
const commissionMonth = (d: Pick<LeadDepositDoc, "depositedAt">) =>
  depositMonthRange(d.depositedAt).from.toISOString().slice(0, 7) as Month;

/**
 * Any deposit, whatever its status. A verified later deposit leaves its month, so the rest of that month is re-rated
 * by the smaller total. If its commission was already paid on a closed payslip, the next salary month takes the
 * difference back (the payroll works differences out from closed months).
 */
export const depositDeleter = deleter<LeadDepositDoc>({
  load: async (id) => {
    const d = (await LeadDeposit.findById(oid(id, "Deposit")).lean()) as LeadDepositDoc | null;
    if (!d) throw new NotFoundError("Deposit");
    return d;
  },
  plan: async (d) => {
    const p = new Plan(
      `the ${DEPOSIT_SEQUENCE_LABELS[d.sequence].toLowerCase()} of ${formatMoney(d.amountMinor, d.currency)} (${formatDate(d.depositedAt)})`,
    );
    if (d.status === "VERIFIED") {
      const month = commissionMonth(d);
      const closed = await PayrollMonth.exists({ month, status: "CLOSED" });
      if (closed) p.warn(`Its commission was paid in ${formatMonth(month)}. The next salary month takes it back.`);
      if (d.sequence === "LATER") p.warn(`Their other later deposits in ${formatMonth(month)} are re-rated by the smaller total.`);
    }
    return p;
  },
  apply: async (d, actor) => {
    const rates = d.status === "VERIFIED" && d.sequence === "LATER" ? await getSetting("crm.commission") : null;
    await LeadDeposit.deleteOne({ _id: d._id });
    const month = rates ? await rerateLaterMonth(d.creditedToId, d.depositedAt, rates) : null;
    await recordActivity(d.leadId, "SYSTEM", actor, {
      body: `${d.status === "VERIFIED" ? "Verified" : d.status === "PENDING" ? "Pending" : "Rejected"} ${DEPOSIT_SEQUENCE_LABELS[d.sequence].toLowerCase()} of ${formatMoney(d.amountMinor, d.currency)} deleted`,
      data: { depositId: String(d._id) },
    });
    await auditDelete({
      actor,
      action: "lead.deposit.delete",
      entityType: "LeadDeposit",
      entityId: String(d._id),
      before: snapshot(d),
      after: month ? { month: month.month, monthTotalMinor: month.totalMinor, monthCommissionMinor: month.afterMinor } : null,
    });
  },
  after: async (d, actor) => {
    if (String(d.creditedToId) === actor.id) return;
    await notifyUser(String(d.creditedToId), {
      title: "Deposit deleted",
      body: `${formatMoney(d.amountMinor, d.currency)} (${DEPOSIT_SEQUENCE_LABELS[d.sequence]}, ${formatDate(d.depositedAt)}) was deleted by an admin.`,
      href: leadHref(d.leadId),
    });
  },
  done: () => "Deposit deleted.",
});
