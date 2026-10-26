"use client";

import { useActionState, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { FormError, type ActionState } from "../forms/field";
import { Button } from "../components/button";
import { cn } from "../lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../components/dialog";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

const SIZES = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" };

/**
 * Header, scrolling body and pinned footer for a dialog form: tall forms scroll inside the dialog instead of
 * running off the screen. Pass the result's `content` to DialogContent.
 */
export const dialogLayout = {
  content: "flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0",
  form: "flex min-h-0 flex-1 flex-col",
  header: "px-5 pt-5 pb-3 pr-12",
  body: "grid min-h-0 flex-1 content-start gap-4 overflow-y-auto overscroll-contain px-5 pt-1 pb-5",
  footer: "m-0 rounded-b-xl",
};

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
  size = "sm",
  bodyClassName,
}: {
  action: Action;
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  hidden: Record<string, string>;
  children?: ReactNode;
  submitLabel?: string;
  destructive?: boolean;
  /** Width from the sm breakpoint up: sm 24rem, md 32rem, lg 42rem, xl 56rem. */
  size?: keyof typeof SIZES;
  bodyClassName?: string;
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
      <DialogContent className={cn(dialogLayout.content, SIZES[size])}>
        <form action={formAction} className={dialogLayout.form}>
          <DialogHeader className={dialogLayout.header}>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          {Object.entries(hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <div className={cn(dialogLayout.body, bodyClassName)}>
            <FormError state={state} />
            {children}
          </div>
          <DialogFooter className={dialogLayout.footer}>
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
