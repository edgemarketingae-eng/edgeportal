"use client";

import { Loader2, Trash2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "../components/alert";
import { Button } from "../components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/card";
import { Input } from "../components/input";
import { Label } from "../components/label";
import type { ActionState } from "../forms/field";
import { ActionDialog } from "./action-dialog";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

/** What deleting a record would do: the API's delete check, as the dialog shows it. */
export interface DeletePlanView {
  label: string;
  blockers: { message: string; href: string | null }[];
  removes: string[];
  warnings: string[];
}

/** The "Type DELETE to confirm" box. The server action checks the value again (`confirmed(form)` in @edge/web). */
export function TypeToConfirm({ onValueChange }: { onValueChange?: (value: string) => void }) {
  const id = useId();
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={id}>
        Type <span className="font-mono font-semibold">DELETE</span> to confirm
      </Label>
      <Input
        id={id}
        name="confirm"
        autoComplete="off"
        autoCapitalize="characters"
        required
        onChange={(e) => onValueChange?.(e.target.value)}
      />
    </div>
  );
}

export const isDeleteTyped = (v: string) => v.trim().toUpperCase() === "DELETE";

function PlanDetails({ plan }: { plan: DeletePlanView }) {
  if (plan.blockers.length)
    return (
      <Alert variant="destructive">
        <AlertTitle>It can&apos;t be deleted yet</AlertTitle>
        <AlertDescription>
          <ul className="mt-1 grid list-disc gap-1 pl-4">
            {plan.blockers.map((b) => (
              <li key={b.message}>
                {b.href ? (
                  <a href={b.href} className="underline underline-offset-2">
                    {b.message}
                  </a>
                ) : (
                  b.message
                )}
              </li>
            ))}
          </ul>
        </AlertDescription>
      </Alert>
    );
  return (
    <>
      {plan.removes.length ? (
        <div className="grid gap-1 text-sm">
          <p className="font-medium">Also removed:</p>
          <ul className="text-muted-foreground grid list-disc gap-0.5 pl-5">
            {plan.removes.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {plan.warnings.length ? (
        <Alert variant="warning">
          <AlertDescription>
            <ul className="grid list-disc gap-1 pl-4">
              {plan.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}

type PlanState = DeletePlanView | { error: string } | null;

/**
 * Permanent delete behind a typed DELETE. Pass the delete check as `plan` (detail pages load it on the server) or a
 * `loadPlan` server action, called with `hidden` when the dialog opens (rows in a list). With blockers there is nothing
 * to submit.
 * Without a `trigger`, control it with `open`/`onOpenChange` (from a menu item: the menu unmounts on close).
 */
export function DeleteDialog({
  action,
  hidden,
  title,
  description = "This can't be undone.",
  plan: planProp,
  loadPlan,
  submitLabel = "Delete",
  trigger,
  open: openProp,
  onOpenChange,
}: {
  action: Action;
  hidden: Record<string, string>;
  /** Defaults to "Delete <the record's label>?" once the check has loaded. */
  title?: string;
  description?: ReactNode;
  plan?: DeletePlanView;
  /** A module-level server action (stable identity), called with `hidden`. */
  loadPlan?: (args: Record<string, string>) => Promise<DeletePlanView | { error: string }>;
  submitLabel?: string;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const [typed, setTyped] = useState("");
  const [loaded, setLoaded] = useState<PlanState>(null);
  function setOpen(next: boolean) {
    setOwnOpen(next);
    onOpenChange?.(next);
    if (!next) {
      setTyped("");
      setLoaded(null);
    }
  }
  const args = JSON.stringify(hidden);
  useEffect(() => {
    if (!open || planProp || !loadPlan) return;
    let live = true;
    loadPlan(JSON.parse(args) as Record<string, string>).then(
      (p) => live && setLoaded(p),
      () => live && setLoaded({ error: "Couldn't check this record. Please try again." }),
    );
    return () => {
      live = false;
    };
  }, [open, planProp, loadPlan, args]);
  const plan = planProp ?? (loaded && "label" in loaded ? loaded : null);
  const failed = loaded && "error" in loaded ? loaded.error : null;
  const waiting = !plan && !failed && !!loadPlan;
  const blocked = !!plan?.blockers.length;
  return (
    <ActionDialog
      action={action}
      hidden={hidden}
      title={title ?? (plan ? `Delete ${plan.label}?` : "Delete?")}
      description={description}
      trigger={trigger}
      open={open}
      onOpenChange={setOpen}
      submitLabel={submitLabel}
      cancelLabel={blocked || failed ? "Close" : "Cancel"}
      submitDisabled={waiting || blocked || !!failed || !isDeleteTyped(typed)}
      destructive
      size="md"
    >
      {waiting ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" /> Checking what&apos;s linked…
        </p>
      ) : failed ? (
        <Alert variant="destructive">
          <AlertDescription>{failed}</AlertDescription>
        </Alert>
      ) : (
        <>
          {plan ? <PlanDetails plan={plan} /> : null}
          {blocked ? null : <TypeToConfirm onValueChange={setTyped} />}
        </>
      )}
    </ActionDialog>
  );
}

/**
 * A Delete button for one record (a list row, a timeline entry): the dialog checks what's linked when it opens.
 * Bind `action` and `loadPlan` to the app's record actions (each app wraps this once as `DeleteButton`).
 */
export function DeleteRecordButton({
  type,
  id,
  next,
  label = "Delete",
  iconOnly,
  title,
  description,
  action,
  loadPlan,
}: {
  type: string;
  id: string;
  /** Where to go after deleting the record whose page you're on. */
  next?: string;
  label?: string;
  iconOnly?: boolean;
  title?: string;
  description?: ReactNode;
  action: Action;
  loadPlan: (args: Record<string, string>) => Promise<DeletePlanView | { error: string }>;
}) {
  return (
    <DeleteDialog
      action={action}
      loadPlan={loadPlan}
      hidden={{ type, id, ...(next ? { next } : {}) }}
      title={title}
      description={description}
      trigger={
        iconOnly ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={label}
            title={label}
            className="text-muted-foreground hover:text-destructive size-7"
          >
            <Trash2 />
          </Button>
        ) : (
          <Button type="button" size="sm" variant="outline" className="text-destructive hover:text-destructive">
            <Trash2 /> {label}
          </Button>
        )
      }
    />
  );
}

/** The danger card at the bottom of a detail page: what's in the way, or the Delete button. */
export function DeleteCard({
  title,
  action,
  hidden,
  plan,
  description,
  blockedHint,
  submitLabel,
}: {
  title: string;
  action: Action;
  hidden: Record<string, string>;
  plan: DeletePlanView;
  description?: ReactNode;
  /** Shown under the blockers, e.g. "Disable the account instead to keep its history." */
  blockedHint?: ReactNode;
  submitLabel?: string;
}) {
  const blocked = plan.blockers.length > 0;
  return (
    <Card className="ring-destructive/30 mt-6">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {blocked ? "Only possible once nothing else depends on it:" : (description ?? "Removed for good. This can't be undone.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {blocked ? (
          <>
            <ul className="grid list-disc gap-1 pl-5 text-sm">
              {plan.blockers.map((b) => (
                <li key={b.message}>
                  {b.href ? (
                    <a href={b.href} className="underline underline-offset-2">
                      {b.message}
                    </a>
                  ) : (
                    b.message
                  )}
                </li>
              ))}
            </ul>
            {blockedHint ? <p className="text-muted-foreground text-sm">{blockedHint}</p> : null}
          </>
        ) : (
          <div>
            <DeleteDialog
              action={action}
              hidden={hidden}
              plan={plan}
              title={`Delete ${plan.label}?`}
              submitLabel={submitLabel}
              trigger={
                <Button size="sm" variant="destructive">
                  <Trash2 /> {submitLabel ?? "Delete"}
                </Button>
              }
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Shows `?flash=` as a success toast once, then drops it from the URL. Delete actions redirect away from the page
 * they removed with `?flash=…`, because a redirect ends the action before the dialog could toast.
 */
export function FlashToast() {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const flash = search.get("flash");
  useEffect(() => {
    if (!flash) return;
    toast.success(flash, { id: `flash:${flash}` });
    const rest = new URLSearchParams(search);
    rest.delete("flash");
    const qs = rest.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [flash, search, router, pathname]);
  return null;
}
