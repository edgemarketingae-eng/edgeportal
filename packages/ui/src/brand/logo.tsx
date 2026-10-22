import Image from "next/image";
import { cn } from "../lib/utils";

/** Reversed lockup (light wordmark): use on Near-Black Teal / Pine surfaces only. */
export function Logo({ className, height = 32 }: { className?: string; height?: number }) {
  const width = Math.round((572 / 168) * height);
  return <Image src="/logo.png" alt="Edge Trading Academy" width={width} height={height} className={cn("h-auto", className)} priority />;
}
