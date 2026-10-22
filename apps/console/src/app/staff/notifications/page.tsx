import { meRoutes } from "@edge/contracts";
import { NotificationList } from "@edge/ui/blocks/notification-list";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import { load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Notifications" };

export default async function StaffNotificationsPage() {
  await requireStaff("staff.access");
  const items = await load(() => api(meRoutes.notifications)); // latest 50; the API marks them read
  return (
    <>
      <PageHeader title="Notifications" />
      <NotificationList items={items} />
    </>
  );
}
