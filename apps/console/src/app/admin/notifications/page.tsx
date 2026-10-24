import { meRoutes } from "@edge/contracts";
import { NotificationList } from "@edge/ui/blocks/notification-list";
import { Pagination } from "@edge/ui/blocks/pagination";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import { load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Notifications" };

export default async function AdminNotificationsPage(props: PageProps<"/admin/notifications">) {
  await requireStaff("admin.access");
  const sp = await props.searchParams;
  const page = await load(() =>
    api(meRoutes.notifications, { query: { page: Number(sp.page) || 1, pageSize: Number(sp.pageSize) || 25 } }),
  ); // the API marks these read
  return (
    <>
      <PageHeader title="Notifications" />
      <NotificationList items={page.rows} />
      <Pagination page={page.page} pageSize={page.pageSize} total={page.total} noun="notifications" defaultSize={25} />
    </>
  );
}
