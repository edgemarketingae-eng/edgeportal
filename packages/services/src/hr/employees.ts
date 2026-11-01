import type { EmployeeInput, EmployeeRecord, PayInput, PayRevisionDto, TeamMemberDto, TeamRow } from "@edge/contracts";
import {
  Employee,
  EmployeePay,
  FileAsset,
  SalaryAdvance,
  StaffProfile,
  Types,
  withTx,
  type EmployeeDoc,
  type EmployeePayDoc,
} from "@edge/db";
import { addMonths, monthOf, type Month } from "@edge/domain/hr/calendar";
import { toMinor } from "@edge/domain/money";
import { audit } from "../audit";
import { BusinessError, NotFoundError, ValidationError } from "../errors";
import { claimFile, deleteFile } from "../files/service";
import { oid } from "../ids";
import { day, iso } from "../mappers";
import { getStaff, listStaff } from "../staff/queries";
import { assertNotSelf, lastClosedMonth, loadEmployee, lockDraftMonth, monthNow, today, toDay, type HrActor } from "./common";
import { cancelLeaveFrom } from "./leave";

const text = (v: string | undefined) => v?.trim() || null;

export function toEmployeeRecord(e: EmployeeDoc): EmployeeRecord {
  return {
    employeeCode: e.employeeCode ?? null,
    department: e.department ?? null,
    joinedOn: day(e.joinedOn)!,
    leftOn: day(e.leftOn),
    nationality: e.nationality ?? null,
    passportNumber: e.passportNumber ?? null,
    emiratesId: e.emiratesId ?? null,
    emergencyName: e.emergencyName ?? null,
    emergencyPhone: e.emergencyPhone ?? null,
    weeklyOffOverride: e.weeklyOffOverride ?? null,
    leaveOverrides: (e.leaveOverrides ?? []).map((o) => ({ typeKey: o.typeKey, daysPerYear: o.daysPerYear })),
  };
}

/** Every staff account, set up or not, so a new login shows up here by itself. */
export async function listTeam(): Promise<TeamRow[]> {
  const [staff, records] = await Promise.all([listStaff(), Employee.find({}, { department: 1, joinedOn: 1, leftOn: 1 }).lean()]);
  const byId = new Map(records.map((r) => [String(r._id), r]));
  return staff.map((s) => {
    const r = byId.get(s.id);
    return {
      id: s.id,
      name: s.name,
      email: s.email,
      title: s.title,
      roles: s.roles,
      disabled: s.disabled,
      setUp: !!r,
      department: r?.department ?? null,
      joinedOn: day(r?.joinedOn),
      leftOn: day(r?.leftOn),
    };
  });
}

export async function getTeamMember(id: string): Promise<TeamMemberDto> {
  const s = await getStaff(id);
  const [e, files] = await Promise.all([
    Employee.findById(oid(id, "Employee")).lean(),
    FileAsset.find({ linkedType: "EmployeeDocument", linkedId: oid(id, "Employee") }, { originalName: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .lean(),
  ]);
  return {
    id: s.id,
    name: s.name,
    email: s.email,
    title: s.title,
    phone: s.phone,
    disabled: s.disabled,
    record: e ? toEmployeeRecord(e as EmployeeDoc) : null,
    documents: files.map((f) => ({ id: String(f._id), name: f.originalName, createdAt: iso(f.createdAt)! })),
  };
}

/** Leave accrues from the month after set-up: what came before is the opening balance HR enters. */
function firstAccrualMonth(joinedOn: Date, setUpOn: Date): Month {
  const startsLater = joinedOn > setUpOn;
  if (startsLater && joinedOn.getUTCDate() === 1) return monthOf(joinedOn);
  return addMonths(monthOf(startsLater ? joinedOn : setUpOn), 1);
}

export async function saveEmployee(id: string, input: EmployeeInput, actor: HrActor) {
  const _id = oid(id, "Employee");
  if (!(await StaffProfile.exists({ _id }))) throw new NotFoundError("Employee");
  const joinedOn = toDay(input.joinedOn);
  const leftOn = input.leftOn ? toDay(input.leftOn) : null;
  if (leftOn && leftOn < joinedOn) throw new ValidationError({ leftOn: "The leaving date can't be before the joining date" });
  const before = await Employee.findById(_id).lean();
  const set = {
    employeeCode: text(input.employeeCode),
    department: text(input.department),
    joinedOn,
    leftOn,
    nationality: text(input.nationality),
    passportNumber: text(input.passportNumber),
    emiratesId: text(input.emiratesId),
    emergencyName: text(input.emergencyName),
    emergencyPhone: text(input.emergencyPhone),
    leaveOverrides: input.leaveOverrides ?? before?.leaveOverrides ?? [],
  };
  const weeklyOff =
    input.weeklyOffOverride === undefined
      ? {}
      : input.weeklyOffOverride
        ? { $set: { weeklyOffOverride: input.weeklyOffOverride } }
        : { $unset: { weeklyOffOverride: 1 } };
  await withTx(async () => {
    await Employee.updateOne(
      { _id },
      { ...weeklyOff, $set: { ...set, ...weeklyOff.$set }, $setOnInsert: { accrualFromMonth: firstAccrualMonth(joinedOn, today()) } },
      { upsert: true },
    );
    await audit({
      actor,
      action: before ? "hr.employee.update" : "hr.employee.create",
      entityType: "Employee",
      entityId: id,
      after: { department: set.department, joinedOn: input.joinedOn, leftOn: input.leftOn || null },
    });
  });
  const leaving = leftOn && (!before?.leftOn || before.leftOn.getTime() !== leftOn.getTime());
  if (leaving) await cancelLeaveFrom(id, leftOn, actor);
}

function toPayDto(p: EmployeePayDoc): PayRevisionDto {
  return {
    id: String(p._id),
    fromMonth: p.fromMonth,
    currency: p.currency,
    baseMinor: p.baseMinor,
    allowances: (p.allowances ?? []).map((a) => ({ label: a.label, amountMinor: a.amountMinor })),
    bankName: p.bankName ?? null,
    accountName: p.accountName ?? null,
    iban: p.iban ?? null,
    note: p.note ?? null,
    createdAt: iso(p.createdAt)!,
  };
}

export async function getPayRevisions(id: string) {
  await loadEmployee(id);
  const [rows, closed] = await Promise.all([
    EmployeePay.find({ employeeId: oid(id) })
      .sort({ fromMonth: -1 })
      .lean(),
    lastClosedMonth(),
  ]);
  return { revisions: (rows as EmployeePayDoc[]).map(toPayDto), earliestMonth: closed ? addMonths(closed, 1) : monthNow() };
}

/** The pay that applies to everyone in a month: each person's latest revision at or before it. */
export async function payForMonth(month: Month) {
  const rows = (await EmployeePay.find({ fromMonth: { $lte: month } })
    .sort({ fromMonth: -1 })
    .lean()) as EmployeePayDoc[];
  const out = new Map<string, EmployeePayDoc>();
  for (const r of rows) if (!out.has(String(r.employeeId))) out.set(String(r.employeeId), r);
  return out;
}

export async function currentPay(employeeId: string) {
  return (await payForMonth(monthNow())).get(employeeId) ?? null;
}

/** Figures stay out of the audit log: its payloads are shown to everyone who can read it. */
export async function savePay(id: string, input: PayInput, actor: HrActor) {
  await assertNotSelf(actor, id, "change your pay");
  const employee = await loadEmployee(id);
  const closed = await lastClosedMonth();
  if (closed && input.fromMonth <= closed)
    throw new ValidationError({ fromMonth: "This month's salary is already closed. Choose a later month" });
  const scheduled = await SalaryAdvance.exists({
    employeeId: employee._id,
    status: "APPROVED",
    currency: { $ne: input.currency },
    "installments.status": "SCHEDULED",
  });
  if (scheduled)
    throw new BusinessError("This person is repaying an advance in their current currency, so it can't change until that's finished", {
      currency: "Finish the advance first",
    });
  await withTx(async () => {
    await lockDraftMonth();
    await EmployeePay.updateOne(
      { employeeId: employee._id, fromMonth: input.fromMonth },
      {
        $set: {
          currency: input.currency,
          baseMinor: toMinor(input.base),
          allowances: (input.allowances ?? []).map((a) => ({ label: a.label.trim(), amountMinor: toMinor(a.amount) })),
          bankName: text(input.bankName),
          accountName: text(input.accountName),
          iban: text(input.iban),
          note: text(input.note),
          createdById: oid(actor.id),
        },
      },
      { upsert: true },
    );
    await audit({ actor, action: "hr.pay.save", entityType: "Employee", entityId: id, after: { fromMonth: input.fromMonth } });
  });
}

export async function claimEmployeeDocument(employeeId: string, fileId: string, actor: HrActor) {
  const e = await loadEmployee(employeeId);
  await withTx(async () => {
    await claimFile(fileId, actor, { linkedType: "EmployeeDocument", linkedId: e._id, ownerId: e._id });
    await audit({ actor, action: "hr.document.add", entityType: "Employee", entityId: employeeId, after: { fileId } });
  });
}

export async function removeEmployeeDocument(employeeId: string, fileId: string, actor: HrActor) {
  const f = await FileAsset.findOne(
    { _id: oid(fileId, "File"), linkedType: "EmployeeDocument", linkedId: new Types.ObjectId(employeeId) },
    { _id: 1 },
  ).lean();
  if (!f) throw new NotFoundError("File");
  await deleteFile(fileId);
  await audit({ actor, action: "hr.document.remove", entityType: "Employee", entityId: employeeId, after: { fileId } });
}
