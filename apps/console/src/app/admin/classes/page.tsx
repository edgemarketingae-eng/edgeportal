import { PageHeader } from "@edge/ui/shell/app-shell";
import type { Metadata } from "next";
import { ClassesManager } from "@/components/classes/manage-pages";
import { requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Live classes" };

export default async function AdminClassesPage(props: PageProps<"/admin/classes">) {
  await requireStaff("class.schedule.any");
  const sp = await props.searchParams;
  return (
    <>
      <PageHeader
        help="/admin/docs/classes"
        title="Live classes"
        description="All batches. Mentors manage their own batches from the staff portal."
      />
      <ClassesManager page={Number(sp.page) || 1} />
    </>
  );
}
