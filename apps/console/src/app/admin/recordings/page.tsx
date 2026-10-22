import { PageHeader } from "@edge/ui/shell/app-shell";
import type { Metadata } from "next";
import { RecordingsManager } from "@/components/classes/manage-pages";
import { requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Recordings" };

export default async function AdminRecordingsPage() {
  await requireStaff("recording.manage");
  return (
    <>
      <PageHeader title="Recordings" />
      <RecordingsManager />
    </>
  );
}
