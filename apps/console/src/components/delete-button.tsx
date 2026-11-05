"use client";

import { DeleteRecordButton } from "@edge/ui/blocks/delete-dialog";
import type { ComponentProps } from "react";
import { deleteCheckAction, deleteRecordAction } from "@/lib/actions/records";

/** Super-admin Delete for one record; checks what's linked when the dialog opens. */
export function DeleteButton(props: Omit<ComponentProps<typeof DeleteRecordButton>, "action" | "loadPlan">) {
  return <DeleteRecordButton {...props} action={deleteRecordAction} loadPlan={deleteCheckAction} />;
}
