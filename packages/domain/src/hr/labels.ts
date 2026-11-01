import type {
  AdvanceStatus,
  AttendanceStatus,
  HalfDayPart,
  HrRequestStatus,
  HrRequestType,
  LeaveLedgerKind,
  LeaveRequestStatus,
  PayLineKind,
} from "./enums";

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  HALF_DAY: "Half day",
  LATE: "Late",
  LEAVE: "On leave",
};

/** Sunday first, matching Date.getUTCDay(). */
export const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const HALF_DAY_LABELS: Record<HalfDayPart, string> = { AM: "Morning", PM: "Afternoon" };

export const LEAVE_STATUS_LABELS: Record<LeaveRequestStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export const LEAVE_LEDGER_LABELS: Record<LeaveLedgerKind, string> = {
  ACCRUAL: "Added",
  ADJUSTMENT: "Adjusted by HR",
  TAKEN: "Leave taken",
  RETURNED: "Returned",
  CARRY_FORWARD: "Carried forward",
};

export const HR_REQUEST_LABELS: Record<HrRequestType, string> = {
  SALARY_CERTIFICATE: "Salary certificate",
  NOC: "NOC",
  EXPERIENCE_LETTER: "Experience letter",
  DOCUMENT_COPY: "Copy of a document",
  OTHER: "Something else",
};

export const HR_REQUEST_STATUS_LABELS: Record<HrRequestStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  DONE: "Done",
  REJECTED: "Rejected",
};

export const ADVANCE_STATUS_LABELS: Record<AdvanceStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Repaying",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  REPAID: "Repaid",
};

export const PAY_LINE_LABELS: Record<PayLineKind, string> = {
  SALARY: "Salary",
  ALLOWANCE: "Allowance",
  COMMISSION: "Commission",
  COMMISSION_ADJUSTMENT: "Commission adjustment",
  BONUS: "Bonus",
  DEDUCTION: "Deduction",
  ADVANCE_REPAYMENT: "Advance repayment",
};
