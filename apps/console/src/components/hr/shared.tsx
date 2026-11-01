import { addMonths, formatMonth } from "@edge/domain/hr/calendar";
import { Button } from "@edge/ui/components/button";
import { Alert, AlertDescription } from "@edge/ui/components/alert";
import { ChevronLeft, ChevronRight, Paperclip } from "lucide-react";
import Link from "next/link";

/** Shown on self-service pages until HR completes the person's record. */
export function NotSetUp() {
  return (
    <Alert>
      <AlertDescription>HR hasn&apos;t set up your record yet. Once they do, your details will appear here.</AlertDescription>
    </Alert>
  );
}

export function MonthNav({ month, basePath, extra }: { month: string; basePath: string; extra?: string }) {
  const href = (m: string) => `${basePath}?month=${m}${extra ? `&${extra}` : ""}`;
  return (
    <div className="flex items-center gap-1">
      <Button asChild variant="outline" size="icon" aria-label="Previous month">
        <Link href={href(addMonths(month, -1))}>
          <ChevronLeft />
        </Link>
      </Button>
      <span className="min-w-36 text-center text-sm font-medium">{formatMonth(month)}</span>
      <Button asChild variant="outline" size="icon" aria-label="Next month">
        <Link href={href(addMonths(month, 1))}>
          <ChevronRight />
        </Link>
      </Button>
    </div>
  );
}

export function FileLink({ file }: { file: { id: string; name: string } }) {
  return (
    <a
      href={`/staff/files/${file.id}`}
      target="_blank"
      rel="noreferrer"
      className="text-edge-emerald inline-flex max-w-full items-center gap-1 text-xs hover:underline"
    >
      <Paperclip aria-hidden className="size-3 shrink-0" />
      <span className="truncate">{file.name}</span>
    </a>
  );
}
