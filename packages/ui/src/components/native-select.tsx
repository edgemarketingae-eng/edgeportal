import * as React from "react";
import { cn } from "cn";
import { ChevronDown } from "lucide-react";
import { controlClass, controlSize } from "../lib/control";

/**
 * A styled native <select>. Native on purpose: it posts with FormData, works with `selectOption` in tests and
 * gives phones their own picker.
 */
function NativeSelect({
  className,
  size = "md",
  wrapperClassName,
  ...props
}: Omit<React.ComponentProps<"select">, "size"> & { size?: "sm" | "md"; wrapperClassName?: string }) {
  return (
    <div data-slot="native-select" className={cn("relative w-full", wrapperClassName)}>
      <select
        data-slot="native-select-control"
        className={cn(controlClass, controlSize[size], "cursor-pointer appearance-none truncate pr-9", className)}
        {...props}
      />
      <ChevronDown aria-hidden className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2" />
    </div>
  );
}

export { NativeSelect };
