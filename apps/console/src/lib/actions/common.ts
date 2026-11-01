import "server-only";
import type { Ok } from "@edge/contracts";
import { dialogError, type ActionState } from "@edge/web/actions";
import { refresh } from "next/cache";

/** Call the API, then re-render the current route with fresh data. */
export async function run(call: () => Promise<Ok | void>, message?: string): Promise<ActionState> {
  let said: string | undefined;
  try {
    said = (await call())?.message;
  } catch (e) {
    return dialogError(e);
  }
  refresh();
  return { ok: true, message: message ?? said };
}
