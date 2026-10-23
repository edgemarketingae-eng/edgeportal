import { ApiError } from "@edge/contracts";
import type { ActionState } from "@edge/ui/forms/field";

export type { ActionState };

export function text(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

export function checked(form: FormData, key: string) {
  const v = form.get(key);
  return v === "on" || v === "true" || v === "1";
}

export function values(form: FormData, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, text(form, k)]));
}

/** Map an API (or unexpected) error to form state; rethrows Next control-flow errors (redirect/notFound). */
export function toActionState(e: unknown, vals?: Record<string, string>): ActionState {
  if (e instanceof ApiError) return { error: e.code === "VALIDATION" && e.fieldErrors ? undefined : e.message, fieldErrors: e.fieldErrors, values: vals };
  if (isNextControlFlow(e)) throw e;
  console.error("[action]", e);
  return { error: "Something went wrong. Please try again.", values: vals };
}

/** Dialog forms have no per-field error slots: surface the first field error as the form error. */
export function dialogError(e: unknown): ActionState {
  const state = toActionState(e);
  if (!state.error && state.fieldErrors) state.error = Object.values(state.fieldErrors).find(Boolean) ?? "Please check the form.";
  return state;
}

function isNextControlFlow(e: unknown) {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK") || digest === "NEXT_NOT_FOUND");
}
