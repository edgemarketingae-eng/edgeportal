import {
  ADVANCE_STATUSES,
  ATTENDANCE_SOURCES,
  ATTENDANCE_STATUSES,
  HALF_DAY_PARTS,
  HR_REQUEST_STATUSES,
  HR_REQUEST_TYPES,
  INSTALLMENT_STATUSES,
  LEAVE_ACCRUALS,
  LEAVE_LEDGER_KINDS,
  LEAVE_REQUEST_STATUSES,
  MANUAL_PAY_LINE_KINDS,
  MARKABLE_ATTENDANCE,
  PAY_CURRENCIES,
  PAY_LINE_KINDS,
  PAY_LINE_SOURCES,
  PAYROLL_MONTH_STATUSES,
} from "@edge/domain/hr/enums";
import { z } from "zod";
import { paged, zDateOnly, zMinor, zObjectId, zOk, zPage } from "./common";
import { route } from "./route";

const base = "/api/v1/hr";
const idParam = z.object({ id: z.string() });
const monthParam = z.object({ month: z.string() });

export const zMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose a month");
const zAmountText = (message: string, min: number) =>
  z
    .string()
    .trim()
    .min(1, "Enter the amount")
    .refine((v) => /^\d{1,9}(\.\d{1,2})?$/.test(v.replace(/,/g, "")) && Number(v.replace(/,/g, "")) >= min, message);
/** Above zero, like an advance or a bonus. */
const zAmount = zAmountText("Enter an amount like 500 or 1250.50", 0.01);
/** Zero allowed: someone paid per class has a zero base salary. */
const zAmountOrZero = zAmountText("Enter an amount like 5000, or 0", 0);
const zOptional = (max = 200) => z.string().trim().max(max).optional();
const zCurrency = z.enum(PAY_CURRENCIES, { message: "Choose a currency" });

const zPerson = z.object({ id: z.string(), name: z.string() });
const zFileRef = z.object({ id: z.string(), name: z.string() });
const zTotal = z.object({ currency: z.enum(PAY_CURRENCIES), minor: z.number() });
export type TotalDto = z.infer<typeof zTotal>;

/* Team */

export const TeamRow = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  title: z.string().nullable(),
  roles: z.array(z.object({ key: z.string(), name: z.string() })),
  disabled: z.boolean(),
  /** False until HR completes the person's record. */
  setUp: z.boolean(),
  department: z.string().nullable(),
  joinedOn: z.string().nullable(),
  leftOn: z.string().nullable(),
});
export type TeamRow = z.infer<typeof TeamRow>;

export const EmployeeRecord = z.object({
  employeeCode: z.string().nullable(),
  department: z.string().nullable(),
  joinedOn: z.string(),
  leftOn: z.string().nullable(),
  nationality: z.string().nullable(),
  passportNumber: z.string().nullable(),
  emiratesId: z.string().nullable(),
  emergencyName: z.string().nullable(),
  emergencyPhone: z.string().nullable(),
  weeklyOffOverride: z.array(z.number()).nullable(),
  leaveOverrides: z.array(z.object({ typeKey: z.string(), daysPerYear: z.number() })),
});
export type EmployeeRecord = z.infer<typeof EmployeeRecord>;

export const TeamMemberDto = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  title: z.string().nullable(),
  phone: z.string().nullable(),
  disabled: z.boolean(),
  record: EmployeeRecord.nullable(),
  documents: z.array(z.object({ id: z.string(), name: z.string(), createdAt: z.string() })),
});
export type TeamMemberDto = z.infer<typeof TeamMemberDto>;

export const EmployeeInput = z.object({
  employeeCode: zOptional(40),
  department: zOptional(80),
  joinedOn: zDateOnly,
  leftOn: z.union([z.literal(""), zDateOnly]).optional(),
  nationality: zOptional(80),
  passportNumber: zOptional(40),
  emiratesId: zOptional(40),
  emergencyName: zOptional(120),
  emergencyPhone: zOptional(40),
  /** Omitted or null uses the company weekly off. */
  weeklyOffOverride: z.array(z.number().int().min(0).max(6)).nullable().optional(),
  leaveOverrides: z.array(z.object({ typeKey: z.string(), daysPerYear: z.number().min(0).max(366) })).optional(),
});
export type EmployeeInput = z.input<typeof EmployeeInput>;

export const PayRevisionDto = z.object({
  id: z.string(),
  fromMonth: z.string(),
  currency: z.enum(PAY_CURRENCIES),
  baseMinor: zMinor,
  allowances: z.array(z.object({ label: z.string(), amountMinor: zMinor })),
  bankName: z.string().nullable(),
  accountName: z.string().nullable(),
  iban: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type PayRevisionDto = z.infer<typeof PayRevisionDto>;

export const PayInput = z.object({
  fromMonth: zMonth,
  currency: zCurrency,
  base: zAmountOrZero,
  allowances: z
    .array(z.object({ label: z.string().trim().min(1, "Name the allowance").max(80), amount: zAmount }))
    .max(20)
    .default([]),
  bankName: zOptional(120),
  accountName: zOptional(120),
  iban: zOptional(60),
  note: zOptional(500),
});
export type PayInput = z.input<typeof PayInput>;

/* Attendance */

const zOffReason = z.enum(["WEEKLY_OFF", "HOLIDAY"]).nullable();

export const AttendanceSheetRow = z.object({
  employeeId: z.string(),
  name: z.string(),
  status: z.enum(ATTENDANCE_STATUSES).nullable(),
  source: z.enum(ATTENDANCE_SOURCES).nullable(),
  note: z.string().nullable(),
  off: zOffReason,
  holidayName: z.string().nullable(),
});
export const AttendanceSheet = z.object({
  day: z.string(),
  /** True when the day's salary month is closed. */
  locked: z.boolean(),
  future: z.boolean(),
  rows: z.array(AttendanceSheetRow),
});
export type AttendanceSheet = z.infer<typeof AttendanceSheet>;

export const AttendanceMark = z.object({
  status: z.enum(ATTENDANCE_STATUSES).nullable(),
  off: zOffReason,
  note: z.string().nullable(),
  holidayName: z.string().nullable(),
});
export type AttendanceMark = z.infer<typeof AttendanceMark>;

export const AttendanceMonth = z.object({
  month: z.string(),
  days: z.array(z.string()),
  people: z.array(z.object({ employeeId: z.string(), name: z.string(), marks: z.record(z.string(), AttendanceMark) })),
});
export type AttendanceMonth = z.infer<typeof AttendanceMonth>;

export const AttendanceSummary = z.object({
  present: z.number(),
  absent: z.number(),
  halfDay: z.number(),
  late: z.number(),
  leave: z.number(),
  unpaidLeaveCenti: z.number(),
});
export type AttendanceSummary = z.infer<typeof AttendanceSummary>;

export const MyAttendance = z.object({
  setUp: z.boolean(),
  month: z.string(),
  days: z.array(AttendanceMark.extend({ day: z.string() })),
  summary: AttendanceSummary,
});
export type MyAttendance = z.infer<typeof MyAttendance>;

export const MarkAttendanceInput = z.object({
  day: zDateOnly,
  /** A null status clears HR's mark for that person. */
  rows: z
    .array(z.object({ employeeId: zObjectId, status: z.enum(MARKABLE_ATTENDANCE).nullable(), note: zOptional(200) }))
    .min(1)
    .max(500),
});
export type MarkAttendanceInput = z.input<typeof MarkAttendanceInput>;

/* Leave */

export const LeaveBalanceDto = z.object({
  typeKey: z.string(),
  name: z.string(),
  paid: z.boolean(),
  tracksBalance: z.boolean(),
  needsAttachment: z.boolean(),
  /** This leave year's balance, in hundredths of a day. */
  balanceCenti: z.number(),
  takenCenti: z.number(),
  active: z.boolean(),
});
export type LeaveBalanceDto = z.infer<typeof LeaveBalanceDto>;

export const LeaveRequestDto = z.object({
  id: z.string(),
  employee: zPerson,
  typeKey: z.string(),
  typeName: z.string(),
  paid: z.boolean(),
  tracksBalance: z.boolean(),
  fromDay: z.string(),
  toDay: z.string(),
  halfDay: z.enum(HALF_DAY_PARTS).nullable(),
  centiDays: z.number(),
  reason: z.string().nullable(),
  attachment: zFileRef.nullable(),
  status: z.enum(LEAVE_REQUEST_STATUSES),
  decidedBy: zPerson.nullable(),
  decidedAt: z.string().nullable(),
  decisionNote: z.string().nullable(),
  allowedNegative: z.boolean(),
  createdAt: z.string(),
  /** Balance left after this request, for the approver. Null when the type keeps no balance. */
  balanceAfterCenti: z.number().nullable(),
});
export type LeaveRequestDto = z.infer<typeof LeaveRequestDto>;

export const LeaveLedgerRow = z.object({
  id: z.string(),
  typeName: z.string(),
  leaveYear: z.number(),
  kind: z.enum(LEAVE_LEDGER_KINDS),
  centiDays: z.number(),
  note: z.string().nullable(),
  by: z.string().nullable(),
  createdAt: z.string(),
});
export type LeaveLedgerRow = z.infer<typeof LeaveLedgerRow>;

export const MyLeave = z.object({
  setUp: z.boolean(),
  year: z.number(),
  balances: z.array(LeaveBalanceDto),
  requests: z.array(LeaveRequestDto),
  ledger: z.array(LeaveLedgerRow),
});
export type MyLeave = z.infer<typeof MyLeave>;

export const LeaveApplyInput = z.object({
  typeKey: z.string().min(1, "Choose a leave type"),
  fromDay: zDateOnly,
  toDay: zDateOnly,
  halfDay: z.enum(HALF_DAY_PARTS).nullable().optional(),
  reason: zOptional(1000),
  attachmentId: zObjectId.nullable().optional(),
});
export type LeaveApplyInput = z.input<typeof LeaveApplyInput>;

export const LeaveFilters = z.object({
  ...zPage.shape,
  status: z.enum(LEAVE_REQUEST_STATUSES).optional(),
  staff: z.string().optional(),
});
export type LeaveFilters = z.input<typeof LeaveFilters>;

export const LeaveDecisionInput = z.object({
  note: zOptional(500),
  allowNegative: z.boolean().optional(),
});

export const BalanceAdjustInput = z.object({
  typeKey: z.string().min(1, "Choose a leave type"),
  /** Signed: -2 takes two days off, 1.5 adds a day and a half. */
  days: z
    .string()
    .trim()
    .refine((v) => /^-?\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) !== 0, "Enter days like 2, 1.5 or -3"),
  note: z.string().trim().min(3, "Say why").max(300),
});
export type BalanceAdjustInput = z.input<typeof BalanceAdjustInput>;

export const EmployeeLeaveDto = z.object({
  year: z.number(),
  balances: z.array(LeaveBalanceDto),
  ledger: z.array(LeaveLedgerRow),
});
export type EmployeeLeaveDto = z.infer<typeof EmployeeLeaveDto>;

/* HR requests */

export const HrRequestDto = z.object({
  id: z.string(),
  employee: zPerson,
  type: z.enum(HR_REQUEST_TYPES),
  subject: z.string(),
  details: z.string().nullable(),
  attachment: zFileRef.nullable(),
  status: z.enum(HR_REQUEST_STATUSES),
  reply: z.string().nullable(),
  replyFile: zFileRef.nullable(),
  handledBy: zPerson.nullable(),
  handledAt: z.string().nullable(),
  createdAt: z.string(),
});
export type HrRequestDto = z.infer<typeof HrRequestDto>;

export const HrRequestInput = z.object({
  type: z.enum(HR_REQUEST_TYPES, { message: "Choose what you need" }),
  subject: z.string().trim().min(3, "Say what you need").max(160),
  details: zOptional(2000),
  attachmentId: zObjectId.nullable().optional(),
});
export type HrRequestInput = z.input<typeof HrRequestInput>;

export const HrRequestFilters = z.object({ ...zPage.shape, status: z.enum(HR_REQUEST_STATUSES).optional() });
export type HrRequestFilters = z.input<typeof HrRequestFilters>;

export const HrRequestReplyInput = z.object({
  status: z.enum(HR_REQUEST_STATUSES, { message: "Choose a status" }),
  reply: zOptional(2000),
  replyFileId: zObjectId.nullable().optional(),
});
export type HrRequestReplyInput = z.input<typeof HrRequestReplyInput>;

/* Advances */

export const InstallmentDto = z.object({ month: z.string(), amountMinor: zMinor, status: z.enum(INSTALLMENT_STATUSES) });

export const AdvanceDto = z.object({
  id: z.string(),
  employee: zPerson,
  amountMinor: zMinor,
  currency: z.enum(PAY_CURRENCIES),
  reason: z.string().nullable(),
  status: z.enum(ADVANCE_STATUSES),
  installments: z.array(InstallmentDto),
  remainingMinor: zMinor,
  decidedBy: zPerson.nullable(),
  decidedAt: z.string().nullable(),
  decisionNote: z.string().nullable(),
  paidOn: z.string().nullable(),
  createdAt: z.string(),
});
export type AdvanceDto = z.infer<typeof AdvanceDto>;

export const MyAdvances = z.object({
  setUp: z.boolean(),
  /** The person's pay currency; requests are always in it. Null until pay is set. */
  currency: z.enum(PAY_CURRENCIES).nullable(),
  rows: z.array(AdvanceDto),
});
export type MyAdvances = z.infer<typeof MyAdvances>;

export const AdvanceInput = z.object({ amount: zAmount, reason: zOptional(1000) });
export type AdvanceInput = z.input<typeof AdvanceInput>;

export const AdvanceFilters = z.object({ ...zPage.shape, status: z.enum(ADVANCE_STATUSES).optional() });
export type AdvanceFilters = z.input<typeof AdvanceFilters>;

export const AdvanceApproveInput = z.object({
  firstMonth: zMonth,
  months: z.coerce.number().int().min(1, "At least one month").max(24, "At most 24 months"),
  paidOn: zDateOnly,
  note: zOptional(500),
});
export type AdvanceApproveInput = z.input<typeof AdvanceApproveInput>;

export const AdvanceRescheduleInput = z.object({
  installments: z
    .array(z.object({ month: zMonth, amount: zAmount }))
    .min(1, "Keep at least one month")
    .max(36),
});
export type AdvanceRescheduleInput = z.input<typeof AdvanceRescheduleInput>;

/* Salary */

export const PayLineDto = z.object({
  id: z.string(),
  kind: z.enum(PAY_LINE_KINDS),
  label: z.string(),
  currency: z.enum(PAY_CURRENCIES),
  amountMinor: zMinor,
  source: z.enum(PAY_LINE_SOURCES),
  forMonth: z.string().nullable(),
});
export type PayLineDto = z.infer<typeof PayLineDto>;

export const PayslipDto = z.object({
  id: z.string(),
  month: z.string(),
  employee: zPerson.extend({ title: z.string().nullable(), department: z.string().nullable() }),
  lines: z.array(PayLineDto),
  totals: z.array(zTotal),
  attendance: AttendanceSummary.nullable(),
  closedAt: z.string().nullable(),
});
export type PayslipDto = z.infer<typeof PayslipDto>;

export const PayslipRow = PayslipDto.omit({ attendance: true });
export type PayslipRow = z.infer<typeof PayslipRow>;

export const PayrollWarning = z.object({
  kind: z.enum(["NO_PAY", "COMMISSION_NO_RECORD", "NEGATIVE", "JOINED", "LEFT", "UNSET"]),
  /** Blocks closing the month until fixed. */
  blocking: z.boolean(),
  employee: zPerson,
  message: z.string(),
});
export type PayrollWarning = z.infer<typeof PayrollWarning>;

export const PayrollMonthRow = z.object({
  month: z.string(),
  status: z.enum(PAYROLL_MONTH_STATUSES),
  people: z.number(),
  totals: z.array(zTotal),
  closedAt: z.string().nullable(),
});
export type PayrollMonthRow = z.infer<typeof PayrollMonthRow>;

export const PayrollMonths = z.object({
  rows: z.array(PayrollMonthRow),
  /** The month that can be started now; null while one is in draft. */
  next: z.string().nullable(),
  /** True before the first month is started: HR picks where salaries begin. */
  firstRun: z.boolean(),
});
export type PayrollMonths = z.infer<typeof PayrollMonths>;

export const PayrollMonthDetail = z.object({
  month: z.string(),
  status: z.enum(PAYROLL_MONTH_STATUSES),
  closedAt: z.string().nullable(),
  payslips: z.array(PayslipDto),
  totals: z.array(zTotal),
  warnings: z.array(PayrollWarning),
});
export type PayrollMonthDetail = z.infer<typeof PayrollMonthDetail>;

export const ManualLineInput = z.object({
  kind: z.enum(MANUAL_PAY_LINE_KINDS, { message: "Choose bonus or deduction" }),
  label: z.string().trim().min(2, "Say what this is for").max(120),
  currency: zCurrency,
  amount: zAmount,
});
export type ManualLineInput = z.input<typeof ManualLineInput>;

export const PayrollCloseResult = z.object({ closed: z.boolean(), changed: z.number() });
export type PayrollCloseResult = z.infer<typeof PayrollCloseResult>;

/* Settings */

const zLeaveType = z.object({
  key: z.string(),
  name: z.string().trim().min(2, "Name the leave type").max(60),
  paid: z.boolean(),
  accrual: z.enum(LEAVE_ACCRUALS),
  daysPerYear: z.number().min(0).max(366),
  carryForwardDays: z.number().min(0).max(366),
  needsAttachment: z.boolean(),
  active: z.boolean(),
});
export const HrSettingsDto = z.object({
  leaveTypes: z.array(zLeaveType),
  weeklyOffDays: z.array(z.number().int().min(0).max(6)),
  holidays: z.array(z.object({ day: z.string(), name: z.string() })),
});
export type HrSettingsDto = z.infer<typeof HrSettingsDto>;
export const HrSettingsInput = z.object({
  leaveTypes: z
    .array(zLeaveType.extend({ key: z.string().optional() }))
    .min(1, "Keep at least one leave type")
    .max(30),
  weeklyOffDays: z.array(z.number().int().min(0).max(6)).max(6, "Leave at least one working day"),
  holidays: z.array(z.object({ day: zDateOnly, name: z.string().trim().min(2, "Name the holiday").max(80) })).max(200),
});
export type HrSettingsInput = z.input<typeof HrSettingsInput>;

/* Portal dashboard */

export const HrHome = z.object({
  setUp: z.boolean(),
  balances: z.array(LeaveBalanceDto),
  latestPayslip: z.object({ month: z.string(), totals: z.array(zTotal), lines: z.array(PayLineDto) }).nullable(),
  pendingLeave: z.number(),
  openRequests: z.number(),
  repayingAdvances: z.number(),
  /** Whether the person has written today's work update. */
  workUpdateToday: z.boolean(),
  /** What HR should look at. Only filled for people who can act on it. */
  queue: z.object({ leave: z.number(), requests: z.number(), advances: z.number(), notSetUp: z.number() }).nullable(),
});
export type HrHome = z.infer<typeof HrHome>;

/* Work updates: short points about the day's work, one entry per person per Dubai day. */

export const WORK_UPDATE_MAX_ITEMS = 20;
export const WORK_UPDATE_MAX_CHARS = 300;
/** How far back someone may still write or change an update. */
export const WORK_UPDATE_BACKFILL_DAYS = 31;

export const WorkUpdateInput = z.object({
  day: zDateOnly,
  /** Blank points are dropped; an empty list clears the day. */
  items: z
    .array(z.string().trim().max(WORK_UPDATE_MAX_CHARS, `Keep each point to ${WORK_UPDATE_MAX_CHARS} characters or fewer`))
    .max(WORK_UPDATE_MAX_ITEMS, `Add up to ${WORK_UPDATE_MAX_ITEMS} points`),
});
export type WorkUpdateInput = z.input<typeof WorkUpdateInput>;

export const WorkUpdateDto = z.object({ id: z.string(), day: z.string(), items: z.array(z.string()), updatedAt: z.string() });
export type WorkUpdateDto = z.infer<typeof WorkUpdateDto>;

export const MyWorkUpdates = z.object({
  /** Today in Dubai, and the earliest day that can still be written. */
  today: z.string(),
  earliest: z.string(),
  day: z.string(),
  items: z.array(z.string()),
  updatedAt: z.string().nullable(),
  recent: z.array(WorkUpdateDto),
});
export type MyWorkUpdates = z.infer<typeof MyWorkUpdates>;

const zUpdatePerson = z.object({ id: z.string(), name: z.string(), title: z.string().nullable() });

export const WorkUpdatesDay = z.object({
  day: z.string(),
  today: z.string(),
  rows: z.array(z.object({ id: z.string(), person: zUpdatePerson, items: z.array(z.string()), updatedAt: z.string() })),
  /** Active staff with nothing logged that day, with the reason they may be away. */
  missing: z.array(zUpdatePerson.extend({ off: z.enum(["LEAVE", "WEEKLY_OFF", "HOLIDAY"]).nullable() })),
});
export type WorkUpdatesDay = z.infer<typeof WorkUpdatesDay>;

export const PersonWorkUpdates = paged(WorkUpdateDto).extend({ person: zUpdatePerson });
export type PersonWorkUpdates = z.infer<typeof PersonWorkUpdates>;

export const hrRoutes = {
  home: route({ method: "GET", path: `${base}/me`, response: HrHome }),

  team: route({ method: "GET", path: `${base}/team`, response: z.array(TeamRow) }),
  member: route({ method: "GET", path: `${base}/team/:id`, params: idParam, response: TeamMemberDto }),
  saveEmployee: route({ method: "POST", path: `${base}/team/:id`, params: idParam, body: EmployeeInput, response: zOk }),
  pay: route({
    method: "GET",
    path: `${base}/team/:id/pay`,
    params: idParam,
    response: z.object({ revisions: z.array(PayRevisionDto), earliestMonth: z.string() }),
  }),
  savePay: route({ method: "POST", path: `${base}/team/:id/pay`, params: idParam, body: PayInput, response: zOk }),
  memberLeave: route({ method: "GET", path: `${base}/team/:id/leave`, params: idParam, response: EmployeeLeaveDto }),
  adjustBalance: route({ method: "POST", path: `${base}/team/:id/leave/adjust`, params: idParam, body: BalanceAdjustInput, response: zOk }),
  addDocument: route({
    method: "POST",
    path: `${base}/team/:id/documents`,
    params: idParam,
    body: z.object({ fileId: zObjectId }),
    response: zOk,
  }),
  removeDocument: route({
    method: "POST",
    path: `${base}/team/:id/documents/:fileId/remove`,
    params: z.object({ id: z.string(), fileId: z.string() }),
    response: zOk,
  }),

  myAttendance: route({
    method: "GET",
    path: `${base}/me/attendance`,
    query: z.object({ month: zMonth.optional() }),
    response: MyAttendance,
  }),
  attendanceDay: route({
    method: "GET",
    path: `${base}/attendance/day`,
    query: z.object({ day: zDateOnly.optional() }),
    response: AttendanceSheet,
  }),
  attendanceMonth: route({
    method: "GET",
    path: `${base}/attendance/month`,
    query: z.object({ month: zMonth.optional() }),
    response: AttendanceMonth,
  }),
  markAttendance: route({ method: "POST", path: `${base}/attendance`, body: MarkAttendanceInput, response: zOk }),

  myLeave: route({ method: "GET", path: `${base}/me/leave`, response: MyLeave }),
  applyLeave: route({ method: "POST", path: `${base}/me/leave`, body: LeaveApplyInput, response: z.object({ id: z.string() }) }),
  cancelMyLeave: route({ method: "POST", path: `${base}/me/leave/:id/cancel`, params: idParam, response: zOk }),
  leaveRequests: route({ method: "GET", path: `${base}/leave`, query: LeaveFilters, response: paged(LeaveRequestDto) }),
  fileLeave: route({
    method: "POST",
    path: `${base}/team/:id/leave`,
    params: idParam,
    body: LeaveApplyInput,
    response: z.object({ id: z.string() }),
  }),
  approveLeave: route({ method: "POST", path: `${base}/leave/:id/approve`, params: idParam, body: LeaveDecisionInput, response: zOk }),
  rejectLeave: route({ method: "POST", path: `${base}/leave/:id/reject`, params: idParam, body: LeaveDecisionInput, response: zOk }),
  cancelLeave: route({ method: "POST", path: `${base}/leave/:id/cancel`, params: idParam, body: LeaveDecisionInput, response: zOk }),

  myRequests: route({ method: "GET", path: `${base}/me/requests`, response: z.array(HrRequestDto) }),
  createRequest: route({ method: "POST", path: `${base}/me/requests`, body: HrRequestInput, response: z.object({ id: z.string() }) }),
  requests: route({ method: "GET", path: `${base}/requests`, query: HrRequestFilters, response: paged(HrRequestDto) }),
  replyRequest: route({ method: "POST", path: `${base}/requests/:id`, params: idParam, body: HrRequestReplyInput, response: zOk }),

  myAdvances: route({ method: "GET", path: `${base}/me/advances`, response: MyAdvances }),
  requestAdvance: route({ method: "POST", path: `${base}/me/advances`, body: AdvanceInput, response: z.object({ id: z.string() }) }),
  cancelMyAdvance: route({ method: "POST", path: `${base}/me/advances/:id/cancel`, params: idParam, response: zOk }),
  advances: route({ method: "GET", path: `${base}/advances`, query: AdvanceFilters, response: paged(AdvanceDto) }),
  approveAdvance: route({
    method: "POST",
    path: `${base}/advances/:id/approve`,
    params: idParam,
    body: AdvanceApproveInput,
    response: zOk,
  }),
  rejectAdvance: route({ method: "POST", path: `${base}/advances/:id/reject`, params: idParam, body: LeaveDecisionInput, response: zOk }),
  rescheduleAdvance: route({
    method: "POST",
    path: `${base}/advances/:id/reschedule`,
    params: idParam,
    body: AdvanceRescheduleInput,
    response: zOk,
  }),

  myPayslips: route({ method: "GET", path: `${base}/me/payslips`, response: z.array(PayslipRow) }),
  myPayslip: route({ method: "GET", path: `${base}/me/payslips/:month`, params: monthParam, response: PayslipDto }),
  payrollMonths: route({ method: "GET", path: `${base}/payroll`, response: PayrollMonths }),
  startMonth: route({ method: "POST", path: `${base}/payroll`, body: z.object({ month: zMonth }), response: zOk }),
  payrollMonth: route({ method: "GET", path: `${base}/payroll/:month`, params: monthParam, response: PayrollMonthDetail }),
  refreshMonth: route({ method: "POST", path: `${base}/payroll/:month/refresh`, params: monthParam, response: zOk }),
  closeMonth: route({ method: "POST", path: `${base}/payroll/:month/close`, params: monthParam, response: PayrollCloseResult }),
  addLine: route({ method: "POST", path: `${base}/payslips/:id/lines`, params: idParam, body: ManualLineInput, response: zOk }),
  removeLine: route({
    method: "POST",
    path: `${base}/payslips/:id/lines/:lineId/remove`,
    params: z.object({ id: z.string(), lineId: z.string() }),
    response: zOk,
  }),

  settings: route({ method: "GET", path: `${base}/settings`, response: HrSettingsDto }),
  saveSettings: route({ method: "POST", path: `${base}/settings`, body: HrSettingsInput, response: zOk }),

  myUpdates: route({
    method: "GET",
    path: `${base}/me/updates`,
    query: z.object({ day: zDateOnly.optional() }),
    response: MyWorkUpdates,
  }),
  saveMyUpdate: route({ method: "POST", path: `${base}/me/updates`, body: WorkUpdateInput, response: zOk }),
  updatesDay: route({
    method: "GET",
    path: `${base}/updates`,
    query: z.object({ day: zDateOnly.optional() }),
    response: WorkUpdatesDay,
  }),
  personUpdates: route({
    method: "GET",
    path: `${base}/updates/people/:id`,
    params: idParam,
    query: zPage,
    response: PersonWorkUpdates,
  }),
};
