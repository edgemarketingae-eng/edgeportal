import { PageHeader } from "@edge/ui/shell/app-shell";
import type { Metadata } from "next";
import { ClassesManager } from "@/components/classes/manage-pages";
import { requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Live classes" };

export default async function StaffClassesPage() {
  await requireStaff("staff.access");
  return (
    <>
      <PageHeader
        title="Live classes"
        description="Classes run on Google Meet. Students see the join button 15 minutes before the start."
      />
      <ClassesManager />
    </>
  );
}
