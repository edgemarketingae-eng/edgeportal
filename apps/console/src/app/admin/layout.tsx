import { adminRoutes } from "@edge/contracts";
import { AppShell, ShellSkeleton, type AreaLink, type NavItem } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import {
  BadgeCheck,
  BookOpen,
  LifeBuoy,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileClock,
  LayoutDashboard,
  PlayCircle,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { Suspense } from "react";
import { can, load, requireStaff } from "@/lib/load";
import { MENU_LINKS } from "@/lib/nav";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}

async function AdminShell({ children }: { children: React.ReactNode }) {
  const v = await requireStaff("admin.access");
  const pending = can(v, "enrollment.read") ? (await load(() => api(adminRoutes.pendingApprovals))).count : 0;
  const items: (NavItem & { show: boolean })[] = [
    { href: "/admin", label: "Overview", icon: <LayoutDashboard />, exact: true, show: true },
    { href: "/admin/approvals", label: "Approvals", icon: <BadgeCheck />, badge: pending, show: can(v, "enrollment.approve") },
    { href: "/admin/students", label: "Students", icon: <Users />, show: can(v, "student.read") },
    { href: "/admin/balances", label: "Advance & balances", icon: <Wallet />, show: can(v, "enrollment.read") },
    { href: "/admin/payments", label: "Payments", icon: <CreditCard />, show: can(v, "payment.read") },
    { href: "/admin/batches", label: "Courses & batches", icon: <BookOpen />, show: can(v, "catalog.manage") },
    { href: "/admin/classes", label: "Live classes", icon: <CalendarDays />, show: can(v, "class.schedule.any") },
    { href: "/admin/recordings", label: "Recordings", icon: <PlayCircle />, show: can(v, "recording.manage") },
    { href: "/admin/staff", label: "Staff & roles", icon: <ShieldCheck />, show: can(v, "staff.manage") },
    { href: "/admin/settings", label: "Settings", icon: <Settings />, show: can(v, "settings.fees") || can(v, "settings.integrations") },
    { href: "/admin/audit", label: "Audit log", icon: <FileClock />, show: can(v, "audit.read") },
    { href: "/admin/notifications", label: "Notifications", icon: <ClipboardList />, show: true },
    { href: "/admin/docs", label: "Help & docs", icon: <LifeBuoy />, show: true },
  ];
  const areas: AreaLink[] = [{ href: "/admin", label: "Admin panel" }];
  if (can(v, "staff.access")) areas.push({ href: "/staff", label: "Staff portal" });
  if (can(v, "crm.access")) areas.push({ href: process.env.CRM_APP_URL ?? "http://crm.localhost:3002", label: "CRM" });
  return (
    <AppShell
      items={items.filter((i) => i.show)}
      user={{ name: v.user.name, email: v.user.email }}
      areaLabel="Admin panel"
      areas={areas}
      menuLinks={MENU_LINKS}
      unread={v.unreadNotifications}
      notificationsHref="/admin/notifications"
      helpHref="/admin/docs"
    >
      {children}
    </AppShell>
  );
}
