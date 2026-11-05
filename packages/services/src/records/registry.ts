import type { RecordType } from "@edge/contracts";
import { enrollmentDeleter, studentDeleter } from "../admin/purge-students";
import { batchDeleter, courseDeleter } from "../catalog/purge";
import { classDeleter, recordingDeleter } from "../classes/purge";
import { callDeleter, depositDeleter, leadActivityDeleter, productDeleter, taskCommentDeleter, taskDeleter } from "../crm/purge";
import { paymentDeleter } from "../payments/purge";
import { NotFoundError } from "../errors";
import {
  advanceDeleter,
  employeeDeleter,
  hrRequestDeleter,
  leaveDeleter,
  payRevisionDeleter,
  payrollMonthDeleter,
  workUpdateDeleter,
} from "../hr/purge";
import { crmStaffDeleter, roleDeleter, staffDeleter } from "../staff/purge";
import type { Deleter } from "./kit";

/** Every record type the shared delete check and delete routes know. Types not listed yet answer 404. */
export const DELETERS: Partial<Record<RecordType, Deleter>> = {
  staff: staffDeleter,
  crmStaff: crmStaffDeleter,
  role: roleDeleter,
  course: courseDeleter,
  batch: batchDeleter,
  class: classDeleter,
  recording: recordingDeleter,
  task: taskDeleter,
  taskComment: taskCommentDeleter,
  leadActivity: leadActivityDeleter,
  product: productDeleter,
  hrRequest: hrRequestDeleter,
  workUpdate: workUpdateDeleter,
  student: studentDeleter,
  enrollment: enrollmentDeleter,
  employee: employeeDeleter,
  payRevision: payRevisionDeleter,
  leave: leaveDeleter,
  advance: advanceDeleter,
  payrollMonth: payrollMonthDeleter,
  call: callDeleter,
  deposit: depositDeleter,
  payment: paymentDeleter,
};

export function deleterFor(type: RecordType): Deleter {
  const d = DELETERS[type];
  if (!d) throw new NotFoundError("Record type");
  return d;
}
