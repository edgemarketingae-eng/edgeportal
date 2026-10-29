"use client";

import { LogOut, Menu } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Button } from "../components/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "../components/sheet";
import { NavLinks, type NavItem } from "./nav";

export function MobileNav({
  items,
  logo,
  areaLabel,
  signOutHref,
}: {
  items: NavItem[];
  logo: ReactNode;
  areaLabel?: string;
  signOutHref?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="border-sidebar-border bg-sidebar text-sidebar-foreground w-72 gap-0 p-4">
        <SheetHeader className="gap-4 p-0 pb-5">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          {logo}
          {areaLabel ? <p className="text-edge-mint/60 px-1 text-[11px] font-semibold tracking-[0.18em] uppercase">{areaLabel}</p> : null}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <NavLinks items={items} onNavigate={() => setOpen(false)} />
        </div>
        {signOutHref ? (
          <div className="border-sidebar-border mt-3 border-t pt-3">
            <Link
              href={signOutHref}
              prefetch={false}
              className="text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:ring-edge-green/70 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none focus-visible:ring-2"
            >
              <LogOut className="size-4" /> Sign out
            </Link>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
