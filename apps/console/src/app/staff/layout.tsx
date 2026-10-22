import { AppShell, ShellSkeleton, type AreaLink, type NavItem } from "@edge/ui/shell/app-shell";
import { CalendarDays, LayoutDashboard, PlayCircle } from "lucide-react";
import { Suspense } from "react";
import { can, requireStaff } from "@/lib/load";
import { MENU_LINKS } from "@/lib/nav";

export default function StaffLayout({ children }: LayoutProps<"/staff">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <StaffShell>{children}</StaffShell>
    </Suspense>
  );
}

async function StaffShell({ children }: { children: React.ReactNode }) {
  const v = await requireStaff("staff.access");
  const items: NavItem[] = [
    { href: "/staff", label: "Dashboard", icon: <LayoutDashboard />, exact: true },
    { href: "/staff/classes", label: "Live classes", icon: <CalendarDays /> },
    { href: "/staff/recordings", label: "Recordings", icon: <PlayCircle /> },
  ];
  const areas: AreaLink[] = [{ href: "/staff", label: "Staff portal" }];
  if (can(v, "admin.access")) areas.push({ href: "/admin", label: "Admin panel" });
  return (
    <AppShell
      items={items}
      user={{ name: v.user.name, email: v.user.email }}
      areaLabel="Staff portal"
      areas={areas}
      menuLinks={MENU_LINKS}
      unread={v.unreadNotifications}
      notificationsHref="/staff/notifications"
    >
      {children}
    </AppShell>
  );
}
