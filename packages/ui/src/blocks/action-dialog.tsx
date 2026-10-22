"use client";

import { useActionState, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { FormError, type ActionState } from "../forms/field";
import { Button } from "../components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../components/dialog";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

/** A button that opens a dialog with a small form bound to a server action. Toasts on success. */
export function ActionDialog({
  action,
  trigger,
  title,
  description,
  hidden,
  children,
  submitLabel = "Confirm",
  destructive,
}: {
  action: Action;
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  hidden: Record<string, string>;
  children?: ReactNode;
  submitLabel?: string;
  destructive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: ActionState, form: FormData) => {
    const result = await action(prev, form);
    if (result.ok) {
      toast.success(result.message ?? "Done");
      setOpen(false);
      return {} as ActionState;
    }
    return result;
  }, {} as ActionState);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form action={formAction} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          {Object.entries(hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <FormError state={state} />
          {children}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending}>
              {pending ? "Working…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** One-click action button (no dialog). Toasts from the action itself so they survive the row unmounting on refresh. */
export function ActionButton({
  action,
  hidden,
  children,
  variant = "default",
  size = "sm",
}: {
  action: Action;
  hidden: Record<string, string>;
  children: ReactNode;
  variant?: "default" | "outline" | "ghost" | "destructive";
  size?: "sm" | "default";
}) {
  const [, formAction, pending] = useActionState(async (prev: ActionState, form: FormData) => {
    const result = await action(prev, form);
    if (result.ok) toast.success(result.message ?? "Done");
    if (result.error) toast.error(result.error);
    return result;
  }, {} as ActionState);
  return (
    <form action={formAction}>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Button type="submit" variant={variant} size={size} disabled={pending}>
        {pending ? "Working…" : children}
      </Button>
    </form>
  );
}
