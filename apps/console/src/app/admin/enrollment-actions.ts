"use server";

import { enrollmentRoutes, type Ok } from "@edge/contracts";
import { dialogError, text, type ActionState } from "@edge/web/actions";
import { api } from "@edge/web/server";
import { refresh } from "next/cache";


/** Call the API, then re-render the current route (and the nav's approval count) with fresh data. */
async function run(call: () => Promise<Ok>): Promise<ActionState> {
  let message: string | undefined;
  try {
    message = (await call()).message;
  } catch (e) {
    return dialogError(e);
  }
  refresh();
  return { ok: true, message };
}

export async function approveAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(() => api(enrollmentRoutes.approve, { params: { id: text(form, "enrollmentId") } }));
}

export async function rejectAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(() => api(enrollmentRoutes.reject, { params: { id: text(form, "enrollmentId") }, body: { reason: text(form, "reason") } }));
}

export async function lockAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(() => api(enrollmentRoutes.lock, { params: { id: text(form, "enrollmentId") }, body: { note: text(form, "note") } }));
}

export async function unlockAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(() =>
    api(enrollmentRoutes.unlock, { params: { id: text(form, "enrollmentId") }, body: { newDueDate: text(form, "newDueDate") } }),
  );
}

export async function extendDueAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(() =>
    api(enrollmentRoutes.extendDue, { params: { id: text(form, "enrollmentId") }, body: { newDueDate: text(form, "newDueDate") } }),
  );
}

export async function changeBatchAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(() =>
    api(enrollmentRoutes.changeBatch, { params: { id: text(form, "enrollmentId") }, body: { batchId: text(form, "batchId") } }),
  );
}

export async function assignBatchAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(() =>
    api(enrollmentRoutes.assignBatch, { params: { id: text(form, "studentId") }, body: { batchId: text(form, "batchId") } }),
  );
}
