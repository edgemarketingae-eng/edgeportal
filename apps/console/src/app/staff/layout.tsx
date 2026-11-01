import { AppShell, ShellSkeleton, type AreaLink, type NavItem } from "@edge/ui/shell/app-shell";
import {
  Banknote,
  CalendarCheck,
  CalendarDays,
  CalendarOff,
  ClipboardCheck,
  HandCoins,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  MessageSquare,
  PlayCircle,
  Settings,
  UserCheck,
  UsersRound,
  Wallet,
} from "lucide-react";
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
  const v = await requireStaff();
  // Grouped under headings; a heading goes on the first item of its group the viewer can see.
  const groups: [string | undefined, (NavItem & { show: boolean })[]][] = [
    [
      undefined,
      [
        { href: "/staff", label: "Dashboard", icon: <LayoutDashboard />, exact: true, show: true },
        { href: "/staff/attendance", label: "My attendance", icon: <CalendarCheck />, show: true },
        { href: "/staff/leave", label: "My leave", icon: <CalendarOff />, show: true },
        { href: "/staff/salary", label: "My salary", icon: <Wallet />, show: true },
        { href: "/staff/advances", label: "Salary advance", icon: <HandCoins />, show: true },
        { href: "/staff/requests", label: "HR requests", icon: <MessageSquare />, show: true },
      ],
    ],
    [
      "Teaching",
      [
        { href: "/staff/classes", label: "Live classes", icon: <CalendarDays />, show: can(v, "staff.access") },
        { href: "/staff/recordings", label: "Recordings", icon: <PlayCircle />, show: can(v, "staff.access") },
      ],
    ],
    [
      "HR",
      [
        { href: "/staff/hr/team", label: "Team", icon: <UsersRound />, show: can(v, "hr.manage") },
        { href: "/staff/hr/attendance", label: "Mark attendance", icon: <UserCheck />, show: can(v, "hr.manage") },
        { href: "/staff/hr/leave", label: "Leave approvals", icon: <ClipboardCheck />, show: can(v, "hr.manage") },
        { href: "/staff/hr/requests", label: "Requests inbox", icon: <Inbox />, show: can(v, "hr.manage") },
        { href: "/staff/hr/salary", label: "Salary months", icon: <Banknote />, show: can(v, "hr.payroll") },
        { href: "/staff/hr/advances", label: "Advance approvals", icon: <HandCoins />, show: can(v, "hr.payroll") },
        { href: "/staff/hr/settings", label: "HR settings", icon: <Settings />, show: can(v, "hr.settings") },
      ],
    ],
    ["More", [{ href: "/staff/docs", label: "Help & docs", icon: <LifeBuoy />, show: true }]],
  ];
  const items: NavItem[] = groups.flatMap(([section, list]) =>
    list.filter((i) => i.show).map(({ show: _show, ...i }, n) => ({ ...i, section: n === 0 ? section : undefined })),
  );
  const areas: AreaLink[] = [{ href: "/staff", label: "Staff portal" }];
  if (can(v, "admin.access")) areas.push({ href: "/admin", label: "Admin panel" });
  if (can(v, "crm.access")) areas.push({ href: process.env.CRM_APP_URL ?? "http://crm.localhost:3002", label: "CRM" });
  return (
    <AppShell
      items={items}
      user={{ name: v.user.name, email: v.user.email }}
      areaLabel="Staff portal"
      areas={areas}
      menuLinks={MENU_LINKS}
      unread={v.unreadNotifications}
      notificationsHref="/staff/notifications"
      helpHref="/staff/docs"
    >
      {children}
    </AppShell>
  );
}
