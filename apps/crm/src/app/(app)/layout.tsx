import { crmRoutes } from "@edge/contracts";
import { AppShell, ShellSkeleton, type AreaLink, type NavItem } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import { Bell, CheckSquare, FolderKanban, LayoutDashboard, LifeBuoy, Settings, Upload, Users, UsersRound } from "lucide-react";
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
  const items: (NavItem & { show: boolean })[] = [
    { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard />, show: true },
    { href: "/leads", label: "Leads", icon: <Users />, show: can(v, "crm.read") },
    { href: "/tasks", label: "Tasks", icon: <CheckSquare />, badge: due, show: can(v, "crm.read") },
    { href: "/projects", label: "Projects", icon: <FolderKanban />, show: can(v, "crm.read") },
    { href: "/team", label: "Team", icon: <UsersRound />, show: can(v, "crm.staff.manage") },
    { href: "/import", label: "Import", icon: <Upload />, show: can(v, "crm.manage") },
    { href: "/settings", label: "Settings", icon: <Settings />, show: can(v, "crm.manage") },
    { href: "/notifications", label: "Notifications", icon: <Bell />, show: true },
    { href: "/docs", label: "Help & docs", icon: <LifeBuoy />, show: true },
  ];
  const areas: AreaLink[] = [{ href: "/dashboard", label: "CRM" }];
  if (can(v, "admin.access")) areas.push({ href: `${CONSOLE_URL()}/admin`, label: "Admin panel" });
  else if (can(v, "staff.access")) areas.push({ href: `${CONSOLE_URL()}/staff`, label: "Staff portal" });
  return (
    <AppShell
      items={items.filter((i) => i.show)}
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
