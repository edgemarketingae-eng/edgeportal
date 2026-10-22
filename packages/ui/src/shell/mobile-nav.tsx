"use client";

import { Menu } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "../components/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "../components/sheet";
import { NavLinks, type NavItem } from "./nav";

export function MobileNav({ items, logo }: { items: NavItem[]; logo: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="border-sidebar-border bg-sidebar text-sidebar-foreground w-72 p-4">
        <SheetHeader className="p-0 pb-4">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          {logo}
        </SheetHeader>
        <NavLinks items={items} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
