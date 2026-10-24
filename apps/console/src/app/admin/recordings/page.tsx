import { PageHeader } from "@edge/ui/shell/app-shell";
import type { Metadata } from "next";
import { RecordingsManager } from "@/components/classes/manage-pages";
import { requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Recordings" };

export default async function AdminRecordingsPage(props: PageProps<"/admin/recordings">) {
  await requireStaff("recording.manage");
  const sp = await props.searchParams;
  return (
    <>
      <PageHeader help="/admin/docs/recordings" title="Recordings" />
      <RecordingsManager page={Number(sp.page) || 1} />
    </>
  );
}
