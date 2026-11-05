import "server-only";
import { RECORD_TYPES, recordRoutes, type DeletePlan, type RecordType } from "@edge/contracts";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { confirmed, dialogError, safeNext, text, toActionState, type ActionState } from "./actions";
import { api } from "./server";

const isRecordType = (t: string): t is RecordType => (RECORD_TYPES as readonly string[]).includes(t);

/** `?flash=` on the page we go to: FlashToast shows it, because a redirect ends the action before the dialog can. */
function withFlash(path: string, message: string) {
  const [base, hash = ""] = path.split("#");
  return `${base}${base!.includes("?") ? "&" : "?"}flash=${encodeURIComponent(message)}${hash ? `#${hash}` : ""}`;
}

/**
 * The body of every app's delete server action: hidden `type`, `id`, optional `next` (where to go once the page's
 * own record is gone) and the typed `confirm`.
 */
export async function deleteRecord(form: FormData): Promise<ActionState> {
  if (!confirmed(form)) return { error: "Type DELETE to confirm." };
  const type = text(form, "type");
  const id = text(form, "id");
  if (!isRecordType(type) || !id) return { error: "Nothing to delete." };
  let message: string;
  try {
    message = (await api(recordRoutes.remove, { params: { type, id }, body: { confirm: "DELETE" } })).message ?? "Deleted.";
  } catch (e) {
    return dialogError(e);
  }
  const next = safeNext(form);
  if (next) redirect(withFlash(next, message));
  refresh();
  return { ok: true, message };
}

/** The delete check for a dialog opened from a list row. */
export async function checkRecord(args: Record<string, string>): Promise<DeletePlan | { error: string }> {
  const type = args.type ?? "";
  const id = args.id ?? "";
  if (!isRecordType(type) || !id) return { error: "Nothing to delete." };
  try {
    return await api(recordRoutes.check, { params: { type, id } });
  } catch (e) {
    return { error: toActionState(e).error ?? "Couldn't check this record." };
  }
}

/** The delete check for a detail page (server component); null when the viewer may not delete it. */
export async function deletePlanFor(type: RecordType, id: string): Promise<DeletePlan | null> {
  try {
    return await api(recordRoutes.check, { params: { type, id } });
  } catch {
    return null;
  }
}
