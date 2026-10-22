import { toActionState, type ActionState } from "@edge/web/actions";

/** Dialog forms have no per-field error slots: surface the first field error as the form error. */
export function dialogError(e: unknown): ActionState {
  const state = toActionState(e);
  if (!state.error && state.fieldErrors) state.error = Object.values(state.fieldErrors).find(Boolean) ?? "Please check the form.";
  return state;
}
