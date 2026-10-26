import { AppShell, ShellSkeleton, type NavItem } from "@edge/ui/shell/app-shell";
import { BookOpen, CreditCard, LayoutDashboard, LifeBuoy, PlayCircle, User, Video } from "lucide-react";
import { Suspense } from "react";
import { getPortal, requireStudent } from "@/lib/load";

export default function StudentLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <StudentShell>{children}</StudentShell>
    </Suspense>
  );
}

async function StudentShell({ children }: { children: React.ReactNode }) {
  const v = await requireStudent();
  const portal = await getPortal();
  const locked = !portal.entitlements.active;
  const items: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard />, exact: true },
    { href: "/batch", label: "My batch", icon: <BookOpen /> },
    { href: "/classes", label: "Live classes", icon: <Video />, locked },
    { href: "/recordings", label: "Recordings", icon: <PlayCircle />, locked },
    { href: "/payments", label: "Payments", icon: <CreditCard /> },
    { href: "/profile", label: "Profile", icon: <User /> },
    { href: "/docs", label: "Help", icon: <LifeBuoy /> },
  ];
  return (
    <AppShell
      items={items}
      user={{ name: v.user.name, email: v.user.email }}
      areaLabel="Student portal"
      unread={v.unreadNotifications}
      notificationsHref="/notifications"
      helpHref="/docs"
      homeHref="/dashboard"
    >
      {children}
    </AppShell>
  );
}
