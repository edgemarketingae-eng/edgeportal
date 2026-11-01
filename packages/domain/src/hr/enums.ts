/** Salary currencies. Nothing is ever converted: each amount stays in its own currency. */
export const PAY_CURRENCIES = ["AED", "USD", "INR"] as const;
export type PayCurrency = (typeof PAY_CURRENCIES)[number];

/** LEAVE rows are written by leave approval; anything else is marked by HR. Weekly offs and holidays are calculated, not stored. */
export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "HALF_DAY", "LATE", "LEAVE"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
/** What HR can pick when marking a day. */
export const MARKABLE_ATTENDANCE = ["PRESENT", "ABSENT", "HALF_DAY", "LATE"] as const;
/** Who wrote the row. Staff check-in can add a SELF source later. */
export const ATTENDANCE_SOURCES = ["HR", "LEAVE"] as const;
export type AttendanceSource = (typeof ATTENDANCE_SOURCES)[number];

export const HALF_DAY_PARTS = ["AM", "PM"] as const;
export type HalfDayPart = (typeof HALF_DAY_PARTS)[number];

/** NONE keeps no balance (unpaid leave, say). */
export const LEAVE_ACCRUALS = ["MONTHLY", "YEARLY", "NONE"] as const;
export type LeaveAccrual = (typeof LEAVE_ACCRUALS)[number];

export const LEAVE_REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
export type LeaveRequestStatus = (typeof LEAVE_REQUEST_STATUSES)[number];

export const LEAVE_LEDGER_KINDS = ["ACCRUAL", "ADJUSTMENT", "TAKEN", "RETURNED", "CARRY_FORWARD"] as const;
export type LeaveLedgerKind = (typeof LEAVE_LEDGER_KINDS)[number];

export const HR_REQUEST_TYPES = ["SALARY_CERTIFICATE", "NOC", "EXPERIENCE_LETTER", "DOCUMENT_COPY", "OTHER"] as const;
export type HrRequestType = (typeof HR_REQUEST_TYPES)[number];

export const HR_REQUEST_STATUSES = ["OPEN", "IN_PROGRESS", "DONE", "REJECTED"] as const;
export type HrRequestStatus = (typeof HR_REQUEST_STATUSES)[number];

export const ADVANCE_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "REPAID"] as const;
export type AdvanceStatus = (typeof ADVANCE_STATUSES)[number];

export const INSTALLMENT_STATUSES = ["SCHEDULED", "DEDUCTED"] as const;
export type InstallmentStatus = (typeof INSTALLMENT_STATUSES)[number];

export const PAYROLL_MONTH_STATUSES = ["DRAFT", "CLOSED"] as const;
export type PayrollMonthStatus = (typeof PAYROLL_MONTH_STATUSES)[number];

/** DEDUCTION and ADVANCE_REPAYMENT are stored negative; a commission adjustment can be either. */
export const PAY_LINE_KINDS = [
  "SALARY",
  "ALLOWANCE",
  "COMMISSION",
  "COMMISSION_ADJUSTMENT",
  "BONUS",
  "DEDUCTION",
  "ADVANCE_REPAYMENT",
] as const;
export type PayLineKind = (typeof PAY_LINE_KINDS)[number];
/** The only kinds HR can add by hand: commission always comes from the CRM. */
export const MANUAL_PAY_LINE_KINDS = ["BONUS", "DEDUCTION"] as const;
export type ManualPayLineKind = (typeof MANUAL_PAY_LINE_KINDS)[number];

export const PAY_LINE_SOURCES = ["SYSTEM", "MANUAL"] as const;
export type PayLineSource = (typeof PAY_LINE_SOURCES)[number];
