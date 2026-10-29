import { Bell, ChevronLeft, CircleHelp, LogOut } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "../brand/logo";
import { Avatar, AvatarFallback } from "../components/avatar";
import { Button } from "../components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/tooltip";
import { MobileNav } from "./mobile-nav";
import { NavLinks, type NavItem } from "./nav";

export type { NavItem };

export interface AreaLink {
  href: string;
  label: string;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Sidebar + header layout shared by both apps. Sign-out is a plain link to the app's
 * /sign-out page, which calls the Better Auth client in the browser (it clears the cookie).
 */
export function AppShell({
  items,
  user,
  areaLabel,
  areas = [],
  menuLinks = [],
  unread = 0,
  notificationsHref,
  helpHref,
  signOutHref = "/sign-out",
  homeHref = "/",
  children,
}: {
  items: NavItem[];
  user: { name: string; email: string };
  areaLabel: string;
  areas?: AreaLink[];
  menuLinks?: AreaLink[];
  unread?: number;
  notificationsHref: string;
  /** The app's Help & docs page, linked from the header. */
  helpHref?: string;
  signOutHref?: string;
  /** Where the logo goes (the student app's `/` is its public landing page). */
  homeHref?: string;
  children: ReactNode;
}) {
  const logo = (
    <Link href={homeHref} aria-label="Home">
      <Logo height={30} />
    </Link>
  );
  return (
    <div className="flex min-h-svh">
      <aside className="border-sidebar-border bg-sidebar text-sidebar-foreground sticky top-0 hidden h-svh w-64 shrink-0 flex-col gap-6 border-r p-4 lg:flex">
        <div className="px-2 pt-2">{logo}</div>
        <p className="text-edge-mint/60 px-3 text-[11px] font-semibold tracking-[0.18em] uppercase">{areaLabel}</p>
        <div className="flex-1 overflow-y-auto">
          <NavLinks items={items} />
        </div>
        <div className="border-sidebar-border border-t pt-3">
          <Link
            href={signOutHref}
            prefetch={false}
            className="text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:ring-edge-green/70 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none focus-visible:ring-2"
          >
            <LogOut className="size-4" /> Sign out
          </Link>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-card/95 sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-3 backdrop-blur sm:px-6">
          <MobileNav items={items} logo={logo} areaLabel={areaLabel} signOutHref={signOutHref} />
          <span className="text-muted-foreground text-sm font-semibold lg:hidden">{areaLabel}</span>
          <div className="ml-auto flex items-center gap-1">
            {helpHref ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button asChild variant="ghost" size="icon" aria-label="Help & docs">
                    <Link href={helpHref}>
                      <CircleHelp />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent sideOffset={6}>Help &amp; docs</TooltipContent>
              </Tooltip>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
                  className="relative"
                >
                  <Link href={notificationsHref}>
                    <Bell />
                    {unread ? (
                      <span className="bg-edge-coral ring-card absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-bold text-white ring-2">
                        {unread > 99 ? "99+" : unread}
                      </span>
                    ) : null}
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent sideOffset={6}>{unread ? `${unread} unread` : "Notifications"}</TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2">
                  <Avatar className="size-7">
                    <AvatarFallback className="bg-edge-emerald text-xs text-white">{initials(user.name)}</AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-40 truncate text-sm sm:inline">{user.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="truncate text-sm font-semibold">{user.name}</div>
                  <div className="text-muted-foreground truncate text-xs">{user.email}</div>
                </DropdownMenuLabel>
                {areas.length > 1 ? (
                  <>
                    <DropdownMenuSeparator />
                    {areas.map((a) => (
                      <DropdownMenuItem key={a.href} asChild>
                        <Link href={a.href}>{a.label}</Link>
                      </DropdownMenuItem>
                    ))}
                  </>
                ) : null}
                <DropdownMenuSeparator />
                {menuLinks.map((a) => (
                  <DropdownMenuItem key={a.href} asChild>
                    <Link href={a.href}>{a.label}</Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem asChild>
                  <Link href={signOutHref} prefetch={false}>
                    Sign out
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

/** `help` links to the docs guide for this page; `back` adds a link above the title to the list a detail page is in. */
export function PageHeader({
  title,
  description,
  actions,
  help,
  back,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  help?: string;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back ? (
          <Link
            href={back.href}
            className="text-muted-foreground hover:text-foreground mb-2 -ml-1 inline-flex items-center gap-0.5 rounded-md px-1 text-sm font-medium"
          >
            <ChevronLeft aria-hidden className="size-4" />
            {back.label}
          </Link>
        ) : null}
        <h1 className="font-display text-2xl uppercase sm:text-3xl">{title}</h1>
        {description || help ? (
          <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {description ? <span>{description}</span> : null}
            {help ? (
              <Link href={help} className="text-edge-emerald inline-flex items-center gap-1 text-xs font-semibold hover:underline">
                <CircleHelp className="size-3.5" /> How this works
              </Link>
            ) : null}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/** Placeholder while the signed-in shell streams in (keeps layout stable, no flash of content). */
export function ShellSkeleton() {
  return (
    <div className="flex min-h-svh" aria-busy="true">
      <aside className="bg-sidebar hidden w-64 shrink-0 lg:block" />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-card/95 h-14 border-b" />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <PageSkeleton />
        </main>
      </div>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="grid animate-pulse gap-4" aria-hidden>
      <div className="bg-muted h-8 w-56 rounded-md" />
      <div className="bg-muted h-4 w-80 max-w-full rounded-md" />
      <div className="bg-muted mt-2 h-40 rounded-xl" />
      <div className="bg-muted h-40 rounded-xl" />
    </div>
  );
}
