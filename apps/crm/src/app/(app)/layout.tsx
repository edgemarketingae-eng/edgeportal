import { crmRoutes } from "@edge/contracts";
import { AppShell, ShellSkeleton, type AreaLink, type NavItem } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import {
  Banknote,
  Bell,
  CheckSquare,
  FolderKanban,
  LayoutDashboard,
  LifeBuoy,
  Package,
  Settings,
  Trophy,
  Upload,
  Users,
  UsersRound,
} from "lucide-react";
import { Suspense } from "react";
import { can, CONSOLE_URL, load, requireCrm } from "@/lib/load";
import { MENU_LINKS } from "@/lib/nav";

export default function CrmLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <CrmShell>{children}</CrmShell>
    </Suspense>
  );
}

async function CrmShell({ children }: { children: React.ReactNode }) {
  const v = await requireCrm("crm.access");
  const due = (await load(() => api(crmRoutes.dueCount))).count;
  // Grouped under headings; a heading goes on the first item of its group the viewer can see.
  const groups: [string | undefined, (NavItem & { show: boolean })[]][] = [
    [undefined, [{ href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard />, show: true }]],
    [
      "Sales",
      [
        { href: "/leads", label: "Leads", icon: <Users />, show: can(v, "crm.read") },
        { href: "/tasks", label: "Tasks", icon: <CheckSquare />, badge: due, show: can(v, "crm.read") },
        { href: "/projects", label: "Projects", icon: <FolderKanban />, show: can(v, "crm.read") },
        { href: "/deposits", label: "Deposits", icon: <Banknote />, show: can(v, "crm.write") || can(v, "crm.commission.manage") },
        { href: "/leaderboard", label: "Leaderboard", icon: <Trophy />, show: can(v, "crm.read") },
      ],
    ],
    [
      "Manage",
      [
        { href: "/team", label: "Team", icon: <UsersRound />, show: can(v, "crm.staff.manage") },
        { href: "/products", label: "Products", icon: <Package />, show: can(v, "crm.manage") },
        { href: "/import", label: "Import", icon: <Upload />, show: can(v, "crm.manage") },
        { href: "/settings", label: "Settings", icon: <Settings />, show: can(v, "crm.manage") },
      ],
    ],
    [
      "More",
      [
        { href: "/notifications", label: "Notifications", icon: <Bell />, show: true },
        { href: "/docs", label: "Help & docs", icon: <LifeBuoy />, show: true },
      ],
    ],
  ];
  const items: NavItem[] = groups.flatMap(([section, list]) =>
    list.filter((i) => i.show).map(({ show: _show, ...i }, n) => ({ ...i, section: n === 0 ? section : undefined })),
  );
  const areas: AreaLink[] = [{ href: "/dashboard", label: "CRM" }];
  if (can(v, "admin.access")) areas.push({ href: `${CONSOLE_URL()}/admin`, label: "Admin panel" });
  else if (can(v, "staff.access")) areas.push({ href: `${CONSOLE_URL()}/staff`, label: "Staff portal" });
  return (
    <AppShell
      items={items}
      user={{ name: v.user.name, email: v.user.email }}
      areaLabel="CRM"
      areas={areas}
      menuLinks={MENU_LINKS}
      unread={v.unreadNotifications}
      notificationsHref="/notifications"
      helpHref="/docs"
    >
      {children}
    </AppShell>
  );
}
