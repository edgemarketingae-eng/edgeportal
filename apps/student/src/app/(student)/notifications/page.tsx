import { meRoutes } from "@edge/contracts";
import { NotificationList } from "@edge/ui/blocks/notification-list";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import { load, requireStudent } from "@/lib/load";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  await requireStudent();
  const items = await load(() => api(meRoutes.notifications));
  return (
    <>
      <PageHeader title="Notifications" />
      <NotificationList items={items} />
    </>
  );
}
