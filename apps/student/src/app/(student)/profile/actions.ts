"use server";

import { studentRoutes } from "@edge/contracts";
import { checked, text, toActionState, type ActionState } from "@edge/web/actions";
import { api } from "@edge/web/server";
import { refresh } from "next/cache";

export async function updateProfileAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await api(studentRoutes.updateProfile, { body: { name: text(form, "name"), jetaFxClientId: text(form, "jetaFxClientId"), marketingConsent: checked(form, "marketingConsent") } });
  } catch (e) {
    return toActionState(e);
  }
  refresh();
  return { ok: true, message: "Profile saved." };
}
