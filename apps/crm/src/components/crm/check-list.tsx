import { Checkbox } from "@edge/ui/components/checkbox";
import { Label } from "@edge/ui/components/label";
import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Ticks posted as repeated `name` values. A fieldset with a legend, so tests find it by its group name. A blank hidden
 * value always goes with it, so unticking everything still saves (the action filters the blank out).
 */
export function CheckList({
  name,
  legend,
  items,
  selected,
  hint,
  empty,
  error,
}: {
  name: string;
  legend: string;
  items: { id: string; label: string; note?: ReactNode }[];
  selected: string[];
  hint?: ReactNode;
  empty?: string;
  error?: string;
}) {
  return (
    <fieldset className="grid content-start gap-2">
      <legend className="mb-1 text-sm font-semibold">{legend}</legend>
      {hint ? <p className="text-muted-foreground -mt-1 text-xs leading-relaxed">{hint}</p> : null}
      <input type="hidden" name={name} value="" />
      {items.length === 0 && empty ? <p className="text-muted-foreground text-xs">{empty}</p> : null}
      <div className="grid max-h-72 gap-1.5 overflow-y-auto sm:grid-cols-2">
        {items.map((s) => (
          <div key={s.id} className="flex items-start gap-2">
            <Checkbox id={`${name}-${s.id}`} name={name} value={s.id} defaultChecked={selected.includes(s.id)} className="mt-0.5" />
            <Label htmlFor={`${name}-${s.id}`} className="block leading-snug font-normal">
              {s.label}
              {s.note ? <span className="text-muted-foreground block text-xs">{s.note}</span> : null}
            </Label>
          </div>
        ))}
      </div>
      {error ? (
        <p className="text-destructive flex items-start gap-1.5 text-xs font-medium">
          <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
