"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/utils";

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  locked?: boolean;
  badge?: number;
  exact?: boolean;
}

export function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="grid gap-1">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
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
        );
      })}
    </nav>
  );
}
