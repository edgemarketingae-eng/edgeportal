import { cn } from "@edge/ui/lib/utils";
import Image from "next/image";
import Link from "next/link";

/** The brand's signature: thick white lines crossing at shallow angles (thin green ones on Ink). */
export function CrossingLines({ dark }: { dark?: boolean }) {
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 -z-10 size-full" viewBox="0 0 1000 1000" preserveAspectRatio="none">
      <g stroke={dark ? "#08E186" : "#FFFFFF"} strokeOpacity={dark ? 0.14 : 0.85} strokeWidth={dark ? 1.5 : 18}>
        <line x1="-50" y1="120" x2="1050" y2="820" vectorEffect="non-scaling-stroke" />
        <line x1="200" y1="-50" x2="760" y2="1050" vectorEffect="non-scaling-stroke" />
        <line x1="1050" y1="200" x2="-50" y2="700" vectorEffect="non-scaling-stroke" />
        <line x1="930" y1="-50" x2="520" y2="1050" vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}

/** Footer of the public pages: logo, contact link and the risk notice. `stickyBar` leaves room for a bottom bar on phones. */
export function SiteFooter({ stickyBar }: { stickyBar?: boolean }) {
  return (
    <footer className={cn("border-edge-ink/10 border-t bg-white", stickyBar && "pb-24 sm:pb-0")}>
      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-10 sm:px-6 md:grid-cols-[auto_1fr] md:items-start md:gap-12">
        <div className="grid gap-2">
          <Image src="/brand/edge-logo-primary.svg" alt="Edge Trading Academy" width={128} height={32} unoptimized />
          <p className="text-edge-ink/60 text-xs">edgeacademy.ae · Dubai, UAE</p>
          <Link href="/support" className="text-edge-emerald w-fit text-sm font-semibold hover:underline">
            Contact us
          </Link>
        </div>
        <div className="text-edge-ink/60 grid gap-2 text-xs leading-relaxed">
          <p>
            <b className="text-edge-ink/80">Educational content only. Trading forex involves significant risk of loss.</b> Trading Forex and
            Gold (XAU/USD) on margin may not be suitable for everyone and you could lose some or all of your capital. Our classes are not
            financial advice.
          </p>
          <p>© Edge Trading Academy · Dubai</p>
        </div>
      </div>
    </footer>
  );
}
