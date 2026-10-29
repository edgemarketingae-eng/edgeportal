import type { ComponentProps, ReactNode } from "react";
import { TableCell, TableRow } from "../components/table";
import { cn } from "../lib/utils";

/** What an empty list or page says: what is missing, why, and the next step (a button or link in `action`). */
export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-1.5 px-4 py-10 text-center", className)}>
      {icon ? (
        <div className="bg-edge-mint/40 text-edge-emerald mb-1.5 flex size-11 items-center justify-center rounded-full [&_svg]:size-5">
          {icon}
        </div>
      ) : null}
      <p className="text-foreground text-sm font-semibold">{title}</p>
      {children ? <div className="text-muted-foreground max-w-md text-sm text-balance">{children}</div> : null}
      {action ? <div className="mt-3 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

/** An EmptyState as the only row of a table. */
export function TableEmpty({ colSpan, ...props }: ComponentProps<typeof EmptyState> & { colSpan: number }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="whitespace-normal">
        <EmptyState {...props} />
      </TableCell>
    </TableRow>
  );
}
