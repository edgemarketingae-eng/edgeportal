import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const alertVariants = cva(
  "group/alert relative grid w-full gap-0.5 rounded-lg border px-3 py-2.5 text-left text-sm has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        info: "border-sky-500/25 bg-sky-50 text-sky-900 *:data-[slot=alert-description]:text-sky-900/80 dark:bg-sky-500/10 dark:text-sky-200 dark:*:data-[slot=alert-description]:text-sky-200/80",
        success:
          "border-edge-emerald/25 bg-edge-mint/40 text-edge-emerald *:data-[slot=alert-description]:text-edge-emerald/90 dark:text-edge-green dark:*:data-[slot=alert-description]:text-edge-green/85",
        warning:
          "border-amber-500/35 bg-amber-50 text-amber-900 *:data-[slot=alert-description]:text-amber-900/80 dark:bg-amber-500/10 dark:text-amber-200 dark:*:data-[slot=alert-description]:text-amber-200/80",
        destructive: "border-destructive/25 bg-destructive/8 text-destructive *:data-[slot=alert-description]:text-destructive/90",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

/** A banner. Errors and warnings are announced at once (role alert), the rest politely (role status). */
function Alert({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role={variant === "destructive" || variant === "warning" ? "alert" : "status"}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "[&_a]:hover:text-foreground font-medium group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3",
        className,
      )}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-muted-foreground [&_a]:hover:text-foreground text-sm text-balance md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_p:not(:last-child)]:mb-4",
        className,
      )}
      {...props}
    />
  );
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-action" className={cn("absolute top-2 right-2", className)} {...props} />;
}

export { Alert, AlertTitle, AlertDescription, AlertAction };
