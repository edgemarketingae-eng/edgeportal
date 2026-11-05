"use server";

import type { ActionState } from "@edge/web/actions";
import { checkRecord, deleteRecord } from "@edge/web/records";

/** Permanent delete from a DeleteDialog / DeleteCard (hidden type, id, optional next; typed DELETE). */
export async function deleteRecordAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return deleteRecord(form);
}

/** What deleting a record would do, for a dialog opened from a list row. */
export async function deleteCheckAction(args: Record<string, string>) {
  return checkRecord(args);
}
