import type { AdvanceApproveInput, AdvanceDto, AdvanceFilters, AdvanceInput, AdvanceRescheduleInput, MyAdvances } from "@edge/contracts";
import { Employee, SalaryAdvance, Types, withTx, type EmployeeDoc, type SalaryAdvanceDoc } from "@edge/db";
import { now } from "@edge/domain/clock";
import { addMonths, formatMonth } from "@edge/domain/hr/calendar";
import { formatPayAmount, splitInstallments } from "@edge/domain/hr/pay";
import { toMinor } from "@edge/domain/money";
import { audit } from "../audit";
import { userNames } from "../crm/common";
import { BusinessError, NotFoundError, TransitionError, ValidationError } from "../errors";
import { oid } from "../ids";
import { day as dayText, iso } from "../mappers";
import { notifyPermissionHolders } from "../notifications/in-app";
import { findPage } from "../paging";
import { assertNotSelf, hrHref, lastClosedMonth, loadOwnRecord, lockDraftMonth, tellEmployee, toDay, type HrActor } from "./common";
import { currentPay } from "./employees";

const remaining = (a: Pick<SalaryAdvanceDoc, "installments" | "status" | "amountMinor">) =>
  a.status === "PENDING"
    ? a.amountMinor
    : a.installments.filter((i) => i.status === "SCHEDULED").reduce((sum, i) => sum + i.amountMinor, 0);

async function toDtos(rows: SalaryAdvanceDoc[]): Promise<AdvanceDto[]> {
  if (!rows.length) return [];
  const names = await userNames(rows.flatMap((a) => [a.employeeId, a.decidedById]));
  return rows.map((a) => ({
    id: String(a._id),
    employee: { id: String(a.employeeId), name: names.get(String(a.employeeId)) ?? "Unknown" },
    amountMinor: a.amountMinor,
    currency: a.currency,
    reason: a.reason ?? null,
    status: a.status,
    installments: a.installments.map((i) => ({ month: i.month, amountMinor: i.amountMinor, status: i.status })),
    remainingMinor: a.status === "APPROVED" || a.status === "PENDING" ? remaining(a) : 0,
    decidedBy: a.decidedById ? { id: String(a.decidedById), name: names.get(String(a.decidedById)) ?? "Unknown" } : null,
    decidedAt: iso(a.decidedAt),
    decisionNote: a.decisionNote ?? null,
    paidOn: dayText(a.paidOn),
    createdAt: iso(a.createdAt)!,
  }));
}

export async function myAdvances(userId: string): Promise<MyAdvances> {
  const e = (await Employee.findById(oid(userId)).lean()) as EmployeeDoc | null;
  if (!e) return { setUp: false, currency: null, rows: [] };
  const [pay, rows] = await Promise.all([
    currentPay(userId),
    SalaryAdvance.find({ employeeId: e._id }).sort({ createdAt: -1 }).limit(50).lean(),
  ]);
  return { setUp: true, currency: pay?.currency ?? null, rows: await toDtos(rows as SalaryAdvanceDoc[]) };
}

export async function requestAdvance(userId: string, input: AdvanceInput, actor: HrActor) {
  const e = await loadOwnRecord(userId);
  const pay = await currentPay(userId);
  if (!pay) throw new BusinessError("HR hasn't set your salary yet.");
  if (await SalaryAdvance.exists({ employeeId: e._id, status: "PENDING" }))
    throw new BusinessError("You already have an advance waiting for approval");
  const amountMinor = toMinor(input.amount);
  const id = await withTx(async () => {
    const [a] = await SalaryAdvance.create([
      { employeeId: e._id, amountMinor, currency: pay.currency, reason: input.reason?.trim() || null },
    ]);
    await audit({ actor, action: "hr.advance.request", entityType: "SalaryAdvance", entityId: String(a!._id) });
    return String(a!._id);
  });
  await notifyPermissionHolders("hr.payroll", {
    title: "Advance to approve",
    body: `${(await userNames([e._id])).get(String(e._id)) ?? "Someone"}: ${formatPayAmount(amountMinor, pay.currency)}`,
    href: hrHref("/hr/advances"),
  });
  return id;
}

export async function cancelMyAdvance(id: string, userId: string, actor: HrActor) {
  const a = await loadAdvance(id);
  if (String(a.employeeId) !== userId) throw new NotFoundError("Advance");
  await withTx(async () => {
    const set = await SalaryAdvance.updateOne({ _id: a._id, status: "PENDING" }, { $set: { status: "CANCELLED" } });
    if (set.modifiedCount !== 1) throw new TransitionError("Only a pending advance can be withdrawn");
    await audit({ actor, action: "hr.advance.withdraw", entityType: "SalaryAdvance", entityId: id });
  });
}

async function loadAdvance(id: string) {
  const a = await SalaryAdvance.findById(oid(id, "Advance")).lean();
  if (!a) throw new NotFoundError("Advance");
  return a as SalaryAdvanceDoc;
}

export async function listAdvances(q: AdvanceFilters) {
  const page = await findPage<SalaryAdvanceDoc>(SalaryAdvance, q.status ? { status: q.status } : {}, { createdAt: -1 }, q);
  return { ...page, rows: await toDtos(page.rows) };
}

async function assertAfterClosed(month: string, field: string) {
  const closed = await lastClosedMonth();
  if (closed && month <= closed) throw new ValidationError({ [field]: `${formatMonth(month)} is already closed. Choose a later month` });
}

export async function approveAdvance(id: string, input: AdvanceApproveInput, actor: HrActor) {
  const a = await loadAdvance(id);
  await assertNotSelf(actor, a.employeeId, "approve your advance");
  if (a.status !== "PENDING") throw new TransitionError("Only a pending advance can be approved");
  await assertAfterClosed(input.firstMonth, "firstMonth");
  const months = Array.from({ length: Number(input.months) }, (_, i) => addMonths(input.firstMonth, i));
  const installments = splitInstallments(a.amountMinor, months).map((i) => ({ ...i, status: "SCHEDULED" as const }));
  await withTx(async () => {
    await lockDraftMonth();
    const set = await SalaryAdvance.updateOne(
      { _id: a._id, status: "PENDING" },
      {
        $set: {
          status: "APPROVED",
          installments,
          paidOn: toDay(input.paidOn),
          decidedById: new Types.ObjectId(actor.id),
          decidedAt: now(),
          decisionNote: input.note?.trim() || null,
        },
      },
    );
    if (set.modifiedCount !== 1) throw new TransitionError("Only a pending advance can be approved");
    await audit({
      actor,
      action: "hr.advance.approve",
      entityType: "SalaryAdvance",
      entityId: id,
      after: { firstMonth: input.firstMonth, months: months.length },
    });
  });
  await tellEmployee(String(a.employeeId), {
    title: "Advance approved",
    body: `Repayment starts in ${formatMonth(input.firstMonth)}.`,
    path: "/advances",
  });
}

export async function rejectAdvance(id: string, input: { note?: string }, actor: HrActor) {
  const a = await loadAdvance(id);
  await assertNotSelf(actor, a.employeeId, "decide your advance");
  const note = input.note?.trim() || null;
  await withTx(async () => {
    const set = await SalaryAdvance.updateOne(
      { _id: a._id, status: "PENDING" },
      { $set: { status: "REJECTED", decidedById: new Types.ObjectId(actor.id), decidedAt: now(), decisionNote: note } },
    );
    if (set.modifiedCount !== 1) throw new TransitionError("Only a pending advance can be rejected");
    await audit({ actor, action: "hr.advance.reject", entityType: "SalaryAdvance", entityId: id });
  });
  await tellEmployee(String(a.employeeId), {
    title: "Advance not approved",
    body: note ?? "Ask HR if you have questions.",
    path: "/advances",
  });
}

/** Moves what's left to other months. Repaid months stay, and the new plan must still add up to what's owed. */
export async function rescheduleAdvance(id: string, input: AdvanceRescheduleInput, actor: HrActor) {
  const a = await loadAdvance(id);
  await assertNotSelf(actor, a.employeeId, "change your advance");
  if (a.status !== "APPROVED") throw new TransitionError("Only an advance being repaid can be rescheduled");
  const plan = input.installments.map((i) => ({ month: i.month, amountMinor: toMinor(i.amount), status: "SCHEDULED" as const }));
  const months = plan.map((i) => i.month);
  if (new Set(months).size !== months.length) throw new ValidationError({ installments: "Use each month once" });
  for (const m of months) await assertAfterClosed(m, "installments");
  const owed = remaining(a);
  if (plan.reduce((sum, i) => sum + i.amountMinor, 0) !== owed)
    throw new ValidationError({ installments: `The months must add up to ${formatPayAmount(owed, a.currency)}` });
  const paid = a.installments.filter((i) => i.status === "DEDUCTED");
  await withTx(async () => {
    await lockDraftMonth();
    await SalaryAdvance.updateOne(
      { _id: a._id, status: "APPROVED" },
      { $set: { installments: [...paid, ...plan].sort((x, y) => x.month.localeCompare(y.month)) } },
    );
    await audit({ actor, action: "hr.advance.reschedule", entityType: "SalaryAdvance", entityId: id, after: { months } });
  });
}
