"use client";

import { useId, type ReactNode } from "react";
import { Label } from "../components/label";
import { cn } from "../lib/utils";

export interface SegmentedOption {
  value: string;
  label: ReactNode;
}

/**
 * Two to four choices side by side, for what would otherwise be a tiny dropdown. Real radios underneath: they post
 * with FormData, move with the arrow keys, reset with their form and read as a radio group.
 */
export function SegmentedControl({
  name,
  label,
  options,
  defaultValue,
  value,
  onValueChange,
  required,
  disabled,
  size = "md",
  className,
  "aria-label": ariaLabel,
}: {
  name: string;
  /** Shown above the choices, like a field label. */
  label?: string;
  options: readonly SegmentedOption[];
  defaultValue?: string;
  /** Controlled; pair with `onValueChange`. */
  value?: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
  "aria-label"?: string;
}) {
  const labelId = useId();
  return (
    <div className={cn("grid content-start gap-2", className)}>
      {label ? <Label id={labelId}>{label}</Label> : null}
      <div
        role="radiogroup"
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : ariaLabel}
        className={cn("bg-muted flex w-full gap-1 rounded-lg p-1", disabled && "opacity-60")}
      >
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "text-muted-foreground hover:text-foreground relative flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 text-center text-sm font-medium transition-colors",
              "has-checked:bg-card has-checked:text-foreground has-focus-visible:ring-edge-green/30 has-checked:shadow-[0_1px_2px_rgb(2_26_26/0.12)] has-focus-visible:ring-4",
              "has-disabled:cursor-not-allowed",
              size === "sm" ? "h-7" : "h-8",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              defaultChecked={value === undefined && defaultValue !== undefined ? o.value === defaultValue : undefined}
              checked={value === undefined ? undefined : o.value === value}
              onChange={() => onValueChange?.(o.value)}
              required={required}
              disabled={disabled}
              // Transparent over the whole segment, so the radio itself takes the click (and tap).
              className="absolute inset-0 m-0 size-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
            />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}
