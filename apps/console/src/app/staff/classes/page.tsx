import { PageHeader } from "@edge/ui/shell/app-shell";
import type { Metadata } from "next";
import { ClassesManager } from "@/components/classes/manage-pages";
import { requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Live classes" };

export default async function StaffClassesPage(props: PageProps<"/staff/classes">) {
  await requireStaff("staff.access");
  const sp = await props.searchParams;
  return (
    <>
      <PageHeader
        help="/staff/docs/classes"
        title="Live classes"
        description="Classes run on Google Meet. Students see the join button 15 minutes before the start."
      />
      <ClassesManager page={Number(sp.page) || 1} />
    </>
  );
}
