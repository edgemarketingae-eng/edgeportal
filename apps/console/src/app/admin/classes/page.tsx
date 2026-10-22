import { PageHeader } from "@edge/ui/shell/app-shell";
import type { Metadata } from "next";
import { ClassesManager } from "@/components/classes/manage-pages";
import { requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Live classes" };

export default async function AdminClassesPage() {
  await requireStaff("class.schedule.any");
  return (
    <>
      <PageHeader title="Live classes" description="All batches. Mentors manage their own batches from the staff portal." />
      <ClassesManager />
    </>
  );
}
