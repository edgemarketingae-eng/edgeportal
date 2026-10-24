import * as React from "react";
import { cn } from "cn";
import { controlClass, controlSize } from "../lib/control";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        controlClass,
        controlSize.md,
        "file:bg-muted file:text-foreground py-2 file:mr-3 file:inline-flex file:h-7 file:rounded-md file:border-0 file:px-2.5 file:text-sm file:font-medium",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
