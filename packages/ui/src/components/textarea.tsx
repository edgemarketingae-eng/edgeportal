import * as React from "react";
import { cn } from "cn";
import { controlClass } from "../lib/control";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(controlClass, "flex field-sizing-content min-h-20 px-3 py-2.5 leading-relaxed", className)}
      {...props}
    />
  );
}

export { Textarea };
