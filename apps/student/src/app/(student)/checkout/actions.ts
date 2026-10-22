"use server";

import { CheckoutInput, paymentRoutes } from "@edge/contracts";
import { text, toActionState, type ActionState } from "@edge/web/actions";
import { api } from "@edge/web/server";
import { redirect } from "next/navigation";

export async function startCheckoutAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = CheckoutInput.safeParse({ kind: text(form, "kind"), amountMinor: text(form, "amountMinor") || undefined, feeRateKey: text(form, "feeRateKey") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your selection." };
  let url: string;
  try {
    url = (await api(paymentRoutes.checkout, { body: parsed.data })).redirectUrl;
  } catch (e) {
    const state = toActionState(e);
    return state.error ? state : { error: Object.values(state.fieldErrors ?? {})[0] ?? "Check your selection." };
  }
  redirect(url); // the gateway's hosted checkout page (or the dev mock checkout)
}
