import "server-only";
import type { Ok } from "@edge/contracts";
import { dialogError, toActionState, type ActionState } from "@edge/web/actions";
import { refresh } from "next/cache";

/** Call the API, then re-render the current route with fresh data. */
export async function run(call: () => Promise<Ok>): Promise<ActionState> {
  let message: string | undefined;
  try {
    message = (await call()).message;
  } catch (e) {
    return dialogError(e);
  }
  refresh();
  return { ok: true, message };
}

/** Forms with one message slot: surface the first field error there. */
export function fail(e: unknown, vals?: Record<string, string>): ActionState {
  const s = toActionState(e, vals);
  return s.error ? s : { ...s, error: Object.values(s.fieldErrors ?? {}).find(Boolean) ?? "Please check the form." };
}
