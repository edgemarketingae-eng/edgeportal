"use server";

import { paymentRoutes } from "@edge/contracts";
import { text, toActionState, type ActionState } from "@edge/web/actions";
import { api } from "@edge/web/server";
import { refresh } from "next/cache";

export async function retryOdooAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let message: string | undefined;
  try {
    message = (await api(paymentRoutes.odooRetry, { params: { id: text(form, "paymentId") } })).message;
  } catch (e) {
    return toActionState(e);
  }
  refresh();
  return { ok: true, message: message ?? "Odoo sync queued." };
}

export async function recheckPaymentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let message: string;
  try {
    message = (await api(paymentRoutes.recheck, { params: { id: text(form, "paymentId") } })).message;
  } catch (e) {
    return toActionState(e);
  }
  refresh();
  return { ok: true, message };
}
