import type { ComponentProps, ReactNode } from "react";
import { Input } from "../components/input";
import { Label } from "../components/label";
import { cn } from "../lib/utils";

export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string | undefined>;
  values?: Record<string, string>;
  step?: string;
}

export function Field({
  label,
  name,
  error,
  hint,
  className,
  children,
  ...input
}: ComponentProps<typeof Input> & { label: string; name: string; error?: string; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={input.id ?? name}>{label}</Label>
      {children ?? <Input id={input.id ?? name} name={name} aria-invalid={!!error || undefined} {...input} />}
      {error ? <p className="text-destructive text-xs">{error}</p> : hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

export function FormError({ state }: { state?: ActionState }) {
  if (!state?.error) return null;
  return (
    <div role="alert" className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
      {state.error}
    </div>
  );
}

export function FormMessage({ state }: { state?: ActionState }) {
  if (!state?.message) return null;
  return (
    <div role="status" className="border-edge-emerald/30 bg-edge-mint/40 text-edge-emerald rounded-md border px-3 py-2 text-sm">
      {state.message}
    </div>
  );
}
