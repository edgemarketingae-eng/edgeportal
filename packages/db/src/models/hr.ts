import {
  ADVANCE_STATUSES,
  ATTENDANCE_SOURCES,
  ATTENDANCE_STATUSES,
  HALF_DAY_PARTS,
  HR_REQUEST_STATUSES,
  HR_REQUEST_TYPES,
  INSTALLMENT_STATUSES,
  LEAVE_LEDGER_KINDS,
  LEAVE_REQUEST_STATUSES,
  PAY_CURRENCIES,
  PAY_LINE_KINDS,
  PAY_LINE_SOURCES,
  PAYROLL_MONTH_STATUSES,
} from "@edge/domain/hr/enums";
import { Schema, model, type InferSchemaType, type Types } from "mongoose";
import { ObjectId, money, partialUnique, timestamps } from "./shared";

const created = { timestamps: { createdAt: true, updatedAt: false }, versionKey: false } as const;

/** _id = the Better Auth user id. A staff account has no record until HR sets it up. */
const employeeSchema = new Schema(
  {
    _id: { type: ObjectId, required: true },
    employeeCode: { type: String, default: null },
    department: { type: String, default: null },
    joinedOn: { type: Date, required: true },
    leftOn: { type: Date, default: null },
    /** The first month that accrues leave, set once. Earlier leave is what HR enters as the opening balance. */
    accrualFromMonth: { type: String, required: true },
    nationality: { type: String, default: null },
    passportNumber: { type: String, default: null },
    emiratesId: { type: String, default: null },
    emergencyName: { type: String, default: null },
    emergencyPhone: { type: String, default: null },
    /** Replaces the company weekly off for this person when set (contracts differ). */
    weeklyOffOverride: { type: [Number], default: undefined },
    /** Replaces a leave type's yearly days for this person. */
    leaveOverrides: {
      type: [new Schema({ typeKey: { type: String, required: true }, daysPerYear: { type: Number, required: true } }, { _id: false })],
      default: [],
    },
    /** Bumped by lockForUpdate: approvals for one person run one at a time, so a balance can't be spent twice. */
    rev: { type: Number, default: 0 },
  },
  { ...timestamps, collection: "employees" },
);
employeeSchema.index({ employeeCode: 1 }, partialUnique("employeeCode"));

/** Salary from a month on; the latest revision at or before a month applies. Kept apart from Employee so hr.manage can't read it. */
const employeePaySchema = new Schema(
  {
    employeeId: { type: ObjectId, required: true },
    fromMonth: { type: String, required: true },
    currency: { type: String, enum: PAY_CURRENCIES, required: true },
    baseMinor: money(),
    allowances: { type: [new Schema({ label: { type: String, required: true }, amountMinor: money() }, { _id: false })], default: [] },
    bankName: { type: String, default: null },
    accountName: { type: String, default: null },
    iban: { type: String, default: null },
    note: { type: String, default: null },
    createdById: { type: ObjectId, required: true },
  },
  { ...timestamps, collection: "employeePay" },
);
employeePaySchema.index({ employeeId: 1, fromMonth: 1 }, { unique: true });

const attendanceDaySchema = new Schema(
  {
    employeeId: { type: ObjectId, required: true },
    day: { type: Date, required: true },
    status: { type: String, enum: ATTENDANCE_STATUSES, required: true },
    source: { type: String, enum: ATTENDANCE_SOURCES, default: "HR", required: true },
    note: { type: String, default: null },
    leaveRequestId: { type: ObjectId, default: null },
    markedById: { type: ObjectId, default: null },
  },
  { ...timestamps, collection: "attendanceDays" },
);
attendanceDaySchema.index({ employeeId: 1, day: 1 }, { unique: true });
attendanceDaySchema.index({ day: 1 });
attendanceDaySchema.index({ leaveRequestId: 1 });

const leaveRequestSchema = new Schema(
  {
    employeeId: { type: ObjectId, required: true },
    typeKey: { type: String, required: true },
    typeName: { type: String, required: true },
    paid: { type: Boolean, required: true },
    tracksBalance: { type: Boolean, required: true },
    fromDay: { type: Date, required: true },
    toDay: { type: Date, required: true },
    halfDay: { type: String, enum: [...HALF_DAY_PARTS, null], default: null },
    /** The working days this request counted when it was made, so calendar changes never alter it. */
    days: {
      type: [new Schema({ day: { type: Date, required: true }, centi: { type: Number, required: true } }, { _id: false })],
      default: [],
    },
    centiDays: { type: Number, required: true },
    reason: { type: String, default: null },
    attachmentId: { type: ObjectId, default: null },
    status: { type: String, enum: LEAVE_REQUEST_STATUSES, default: "PENDING", required: true },
    filedById: { type: ObjectId, required: true },
    decidedById: { type: ObjectId, default: null },
    decidedAt: { type: Date, default: null },
    decisionNote: { type: String, default: null },
    allowedNegative: { type: Boolean, default: false },
  },
  { ...timestamps, collection: "leaveRequests" },
);
leaveRequestSchema.index({ employeeId: 1, fromDay: -1 });
leaveRequestSchema.index({ status: 1, fromDay: 1 });

/** Append-only. A balance is the sum of its leave year's rows. `key` makes job and approval rows safe to repeat. */
const leaveLedgerSchema = new Schema(
  {
    employeeId: { type: ObjectId, required: true },
    typeKey: { type: String, required: true },
    leaveYear: { type: Number, required: true },
    kind: { type: String, enum: LEAVE_LEDGER_KINDS, required: true },
    centiDays: { type: Number, required: true },
    key: { type: String, default: null },
    leaveRequestId: { type: ObjectId, default: null },
    note: { type: String, default: null },
    byId: { type: ObjectId, default: null },
  },
  { ...created, collection: "leaveLedger" },
);
leaveLedgerSchema.index({ key: 1 }, partialUnique("key"));
leaveLedgerSchema.index({ employeeId: 1, leaveYear: 1, typeKey: 1, createdAt: -1 });

const hrRequestSchema = new Schema(
  {
    employeeId: { type: ObjectId, required: true },
    type: { type: String, enum: HR_REQUEST_TYPES, required: true },
    subject: { type: String, required: true },
    details: { type: String, default: null },
    attachmentId: { type: ObjectId, default: null },
    status: { type: String, enum: HR_REQUEST_STATUSES, default: "OPEN", required: true },
    reply: { type: String, default: null },
    replyFileId: { type: ObjectId, default: null },
    handledById: { type: ObjectId, default: null },
    handledAt: { type: Date, default: null },
  },
  { ...timestamps, collection: "hrRequests" },
);
hrRequestSchema.index({ employeeId: 1, createdAt: -1 });
hrRequestSchema.index({ status: 1, createdAt: -1 });

const installmentSchema = new Schema(
  {
    month: { type: String, required: true },
    amountMinor: money(),
    status: { type: String, enum: INSTALLMENT_STATUSES, default: "SCHEDULED", required: true },
  },
  { _id: false },
);

const salaryAdvanceSchema = new Schema(
  {
    employeeId: { type: ObjectId, required: true },
    amountMinor: money(),
    currency: { type: String, enum: PAY_CURRENCIES, required: true },
    reason: { type: String, default: null },
    status: { type: String, enum: ADVANCE_STATUSES, default: "PENDING", required: true },
    installments: { type: [installmentSchema], default: [] },
    decidedById: { type: ObjectId, default: null },
    decidedAt: { type: Date, default: null },
    decisionNote: { type: String, default: null },
    paidOn: { type: Date, default: null },
  },
  { ...timestamps, collection: "salaryAdvances" },
);
salaryAdvanceSchema.index({ employeeId: 1, createdAt: -1 });
salaryAdvanceSchema.index({ status: 1, createdAt: -1 });
salaryAdvanceSchema.index({ "installments.month": 1, "installments.status": 1 });

const payrollMonthSchema = new Schema(
  {
    month: { type: String, required: true },
    status: { type: String, enum: PAYROLL_MONTH_STATUSES, default: "DRAFT", required: true },
    startedById: { type: ObjectId, required: true },
    closedById: { type: ObjectId, default: null },
    closedAt: { type: Date, default: null },
    /** Bumped by lockForUpdate: anything changing this month's data locks it first, so edits can't slip in during close. */
    rev: { type: Number, default: 0 },
  },
  { ...timestamps, collection: "payrollMonths" },
);
payrollMonthSchema.index({ month: 1 }, { unique: true });
// Two open drafts would each pay the same commission difference.
payrollMonthSchema.index({ status: 1 }, { unique: true, partialFilterExpression: { status: "DRAFT" } });

const payLineSchema = new Schema({
  kind: { type: String, enum: PAY_LINE_KINDS, required: true },
  label: { type: String, required: true },
  currency: { type: String, enum: PAY_CURRENCIES, required: true },
  /** Signed: deductions and repayments are negative. */
  amountMinor: money(),
  source: { type: String, enum: PAY_LINE_SOURCES, default: "SYSTEM", required: true },
  /** Commission lines: the month the deposits belong to. */
  forMonth: { type: String, default: null },
  advanceId: { type: ObjectId, default: null },
});

const payslipSchema = new Schema(
  {
    month: { type: String, required: true },
    employeeId: { type: ObjectId, required: true },
    lines: { type: [payLineSchema], default: [] },
    attendance: {
      type: new Schema(
        {
          present: { type: Number, default: 0 },
          absent: { type: Number, default: 0 },
          halfDay: { type: Number, default: 0 },
          late: { type: Number, default: 0 },
          leave: { type: Number, default: 0 },
          unpaidLeaveCenti: { type: Number, default: 0 },
        },
        { _id: false },
      ),
      default: null,
    },
    /** Set when the month closes. Staff only ever see closed payslips. */
    closedAt: { type: Date, default: null },
  },
  { ...timestamps, collection: "payslips" },
);
payslipSchema.index({ month: 1, employeeId: 1 }, { unique: true });
payslipSchema.index({ employeeId: 1, month: -1 });

/**
 * A staff member's work update for one Dubai day: short free-text points. Keyed by the user id, not an Employee record,
 * so anyone with a staff account can log one before HR sets them up.
 */
const workUpdateSchema = new Schema(
  {
    userId: { type: ObjectId, required: true },
    /** UTC midnight of the Dubai calendar day. */
    day: { type: Date, required: true },
    items: { type: [String], default: [] },
  },
  { ...timestamps, collection: "workUpdates" },
);
workUpdateSchema.index({ userId: 1, day: 1 }, { unique: true });
workUpdateSchema.index({ day: 1 });

export const Employee = model("Employee", employeeSchema);
export const EmployeePay = model("EmployeePay", employeePaySchema);
export const AttendanceDay = model("AttendanceDay", attendanceDaySchema);
export const LeaveRequest = model("LeaveRequest", leaveRequestSchema);
export const LeaveLedger = model("LeaveLedger", leaveLedgerSchema);
export const HrRequest = model("HrRequest", hrRequestSchema);
export const SalaryAdvance = model("SalaryAdvance", salaryAdvanceSchema);
export const PayrollMonth = model("PayrollMonth", payrollMonthSchema);
export const Payslip = model("Payslip", payslipSchema);
export const WorkUpdate = model("WorkUpdate", workUpdateSchema);

export type EmployeeDoc = InferSchemaType<typeof employeeSchema> & { _id: Types.ObjectId };
export type EmployeePayDoc = InferSchemaType<typeof employeePaySchema> & { _id: Types.ObjectId };
export type AttendanceDayDoc = InferSchemaType<typeof attendanceDaySchema> & { _id: Types.ObjectId };
export type LeaveRequestDoc = InferSchemaType<typeof leaveRequestSchema> & { _id: Types.ObjectId };
export type LeaveLedgerDoc = InferSchemaType<typeof leaveLedgerSchema> & { _id: Types.ObjectId };
export type HrRequestDoc = InferSchemaType<typeof hrRequestSchema> & { _id: Types.ObjectId };
export type SalaryAdvanceDoc = InferSchemaType<typeof salaryAdvanceSchema> & { _id: Types.ObjectId };
export type PayrollMonthDoc = InferSchemaType<typeof payrollMonthSchema> & { _id: Types.ObjectId };
export type PayslipDoc = InferSchemaType<typeof payslipSchema> & { _id: Types.ObjectId };
export type WorkUpdateDoc = InferSchemaType<typeof workUpdateSchema> & { _id: Types.ObjectId };
