import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/utils";

/** A "show more" toggle (a styled <details>): the summary line with a chevron that turns when it opens. */
export function Disclosure({
  summary,
  children,
  defaultOpen,
  className,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details open={defaultOpen} className={cn("group/disclosure", className)}>
      <summary className="text-muted-foreground hover:text-foreground inline-flex list-none items-center gap-1 rounded-md text-sm font-medium select-none [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-4 transition-transform group-open/disclosure:rotate-90" />
        {summary}
      </summary>
      <div className="mt-2 pl-5">{children}</div>
    </details>
  );
}
