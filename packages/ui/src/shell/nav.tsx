"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { cn } from "../lib/utils";

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  locked?: boolean;
  badge?: number;
  exact?: boolean;
  /** Heading of the group this item starts; later items stay in it until the next one with a section. */
  section?: string;
}

export function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="grid gap-1">
      {items.map((item, i) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Fragment key={item.href}>
            {item.section ? (
              <p
                className={cn(
                  "text-sidebar-foreground/45 px-3 pb-1 text-[11px] font-semibold tracking-[0.14em] uppercase",
                  i > 0 && "pt-4",
                )}
              >
                {item.section}
              </p>
            ) : null}
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "focus-visible:ring-edge-green/70 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2",
                active
                  ? "bg-sidebar-accent text-edge-green"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                item.locked && "opacity-60",
              )}
            >
              <span className="[&_svg]:size-4">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.locked ? <Lock className="size-3.5" aria-label="Locked" /> : null}
              {item.badge ? <span className="bg-edge-green text-edge-ink rounded-full px-1.5 text-xs font-bold">{item.badge}</span> : null}
            </Link>
          </Fragment>
        );
      })}
    </nav>
  );
}
