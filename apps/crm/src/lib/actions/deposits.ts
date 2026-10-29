"use server";

import { crmRoutes, type RouteBody } from "@edge/contracts";
import { text, values, type ActionState } from "@edge/web/actions";
import { api } from "@edge/web/server";
import { refresh } from "next/cache";
import { fail, run } from "./common";

export async function logDepositAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    await api(crmRoutes.logDeposit, {
      params: { id: text(form, "id") },
      body: {
        sequence: text(form, "sequence") as RouteBody<typeof crmRoutes.logDeposit>["sequence"],
        amount: text(form, "amount"),
        depositedAt: text(form, "depositedAt"),
        jetaFxClientId: text(form, "jetaFxClientId"),
        reference: text(form, "reference"),
        note: text(form, "note"),
      },
    });
    return { ok: true, message: "Deposit logged. It earns commission once it's verified." };
  });
}

export async function verifyDepositAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(() => api(crmRoutes.verifyDeposit, { params: { id: text(form, "id") } }));
}

export async function rejectDepositAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(() => api(crmRoutes.rejectDeposit, { params: { id: text(form, "id") }, body: { reason: text(form, "reason") } }));
}

export async function deleteDepositAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(() => api(crmRoutes.deleteDeposit, { params: { id: text(form, "id") } }));
}

/** The slab rows as posted: one `slabFrom` and one `slabPct` per row, in order. */
function slabRows(form: FormData) {
  const pcts = form.getAll("slabPct").map((x) => String(x).trim());
  return form.getAll("slabFrom").map((x, i) => ({ from: String(x).trim(), pct: pcts[i] ?? "" }));
}

export async function saveCommissionSettingsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let message: string | undefined;
  const slabs = slabRows(form);
  try {
    message = (
      await api(crmRoutes.saveCommissionSettings, {
        body: { firstPct: text(form, "firstPct"), slabs } satisfies RouteBody<typeof crmRoutes.saveCommissionSettings>,
      })
    ).message;
  } catch (e) {
    return fail(e, { ...values(form, ["firstPct"]), slabs: JSON.stringify(slabs) });
  }
  refresh();
  return { ok: true, message };
}
