"use server";

import { crmRoutes } from "@edge/contracts";
import { text, type ActionState } from "@edge/web/actions";
import { api } from "@edge/web/server";
import { run } from "./common";

export async function removeDeviceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(() => api(crmRoutes.removeDevice, { params: { id: text(form, "deviceId") } }));
}
