import { CircleAlert, CircleCheck } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Alert, AlertDescription } from "../components/alert";
import { Input } from "../components/input";
import { Label } from "../components/label";
import { cn } from "../lib/utils";
import { DatePicker, TimeInput } from "./date-picker";
import { PhoneInput } from "./phone-input";

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
  const id = input.id ?? name;
  const invalid = !!error || undefined;
  const msgId = error || hint ? `${id}-msg` : undefined;
  let control = children;
  if (!control && (input.type === "date" || input.type === "datetime-local")) {
    control = (
      <DatePicker
        id={id}
        name={name}
        mode={input.type === "date" ? "date" : "datetime"}
        defaultValue={typeof input.defaultValue === "string" ? input.defaultValue : undefined}
        required={input.required}
        disabled={input.disabled}
        placeholder={input.placeholder}
        aria-invalid={invalid}
        aria-describedby={msgId}
      />
    );
  } else if (!control && input.type === "tel") {
    control = (
      <PhoneInput
        id={id}
        name={name}
        defaultValue={typeof input.defaultValue === "string" ? input.defaultValue : undefined}
        required={input.required}
        disabled={input.disabled}
        placeholder={input.placeholder}
        autoComplete={input.autoComplete}
        aria-invalid={invalid}
        aria-describedby={msgId}
      />
    );
  } else if (!control && input.type === "time") {
    control = <TimeInput id={id} name={name} aria-invalid={invalid} aria-describedby={msgId} {...input} />;
  }
  return (
    <div className={cn("grid content-start gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {control ?? <Input id={id} name={name} aria-invalid={invalid} aria-describedby={msgId} {...input} />}
      {error ? (
        <p id={msgId} className="text-destructive flex items-start gap-1.5 text-xs font-medium">
          <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p id={msgId} className="text-muted-foreground text-xs leading-relaxed">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FormError({ state }: { state?: ActionState }) {
  if (!state?.error) return null;
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden />
      <AlertDescription>{state.error}</AlertDescription>
    </Alert>
  );
}

export function FormMessage({ state }: { state?: ActionState }) {
  if (!state?.message) return null;
  return (
    <Alert variant="success">
      <CircleCheck aria-hidden />
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}
