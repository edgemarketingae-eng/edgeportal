import { catalogRoutes } from "@edge/contracts";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import { BatchForm } from "@/components/catalog/batch-form";
import { load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "New batch" };

export default async function NewBatchPage() {
  await requireStaff("catalog.manage");
  const [allCourses, mentors] = await Promise.all([load(() => api(catalogRoutes.listCourses)), load(() => api(catalogRoutes.listMentors))]);
  const courses = allCourses.filter((c) => c.isActive).sort((a, b) => a.title.localeCompare(b.title));
  return (
    <>
      <PageHeader title="New batch" />
      <BatchForm
        courses={courses}
        mentors={mentors.map((m) => ({ id: m.userId, name: m.name }))}
        values={{
          courseId: courses[0]?.id ?? "",
          code: "",
          name: "",
          description: "",
          startDate: "",
          endDate: "",
          scheduleText: "",
          capacity: "",
          status: "DRAFT",
          fee: "5000",
          advanceEnabled: true,
          advancePresets: "200, 300, 500",
          allowCustomAdvance: true,
          balanceDueRule: "DAYS_AFTER_FIRST_PAYMENT",
          balanceDueDate: "",
          balanceDueDays: "30",
          lockGraceDays: "0",
          whatsappGroupUrl: "",
          isCurrentForEnrollment: false,
          mentorIds: [],
        }}
      />
    </>
  );
}
