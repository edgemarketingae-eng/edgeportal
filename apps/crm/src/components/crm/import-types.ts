import type { ImportPreviewDto } from "@edge/contracts";
import type { ActionState } from "@edge/web/actions";

/** Two-step import form state: paste/upload -> preview -> import. */
export interface ImportState extends ActionState {
  preview?: ImportPreviewDto;
  result?: { created: number; skipped: number; invalid: number };
}
