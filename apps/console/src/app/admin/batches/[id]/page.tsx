import { catalogRoutes } from "@edge/contracts";
import { DeleteCard } from "@edge/ui/blocks/delete-dialog";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { deletePlanFor } from "@edge/web/records";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import { BatchForm } from "@/components/catalog/batch-form";
import { deleteRecordAction } from "@/lib/actions/records";
import { can, load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Edit batch" };

/** Minor units to the amount string the form takes (whole amounts without decimals). */
const amt = (m: number) => (m / 100).toFixed(m % 100 ? 2 : 0);

export default async function EditBatchPage(props: PageProps<"/admin/batches/[id]">) {
  const v = await requireStaff("catalog.manage");
  const { id } = await props.params;
  const sp = await props.searchParams;
  const [b, courses, mentors, deletePlan] = await Promise.all([
    load(() => api(catalogRoutes.getBatch, { params: { id } })),
    load(() => api(catalogRoutes.listCourses)),
    load(() => api(catalogRoutes.listMentors)),
    can(v, "records.delete") ? deletePlanFor("batch", id) : null,
  ]);
  return (
    <>
      <PageHeader help="/admin/docs/batches" title={b.name} description={sp.created ? "Batch created." : `Code ${b.code}`} />
      <BatchForm
        courses={[...courses].sort((x, y) => x.title.localeCompare(y.title))}
        mentors={mentors.map((m) => ({ id: m.userId, name: m.name }))}
        values={{
          id: b.id,
          courseId: b.courseId,
          code: b.code,
          name: b.name,
          description: b.description ?? "",
          startDate: b.startDate,
          endDate: b.endDate ?? "",
          scheduleText: b.scheduleText ?? "",
          capacity: b.capacity?.toString() ?? "",
          status: b.status,
          fee: amt(b.feeMinor),
          advanceEnabled: b.advanceEnabled,
          advancePresets: b.advancePresetsMinor.map(amt).join(", "),
          allowCustomAdvance: b.allowCustomAdvance,
          balanceDueRule: b.balanceDueRule,
          balanceDueDate: b.balanceDueDate ?? "",
          balanceDueDays: b.balanceDueDays?.toString() ?? "",
          lockGraceDays: b.lockGraceDays.toString(),
          whatsappGroupUrl: b.whatsappGroupUrl ?? "",
          isCurrentForEnrollment: b.isCurrentForEnrollment,
          mentorIds: b.mentors.map((m) => m.userId),
        }}
      />
      {deletePlan ? (
        <DeleteCard
          title="Delete batch"
          action={deleteRecordAction}
          hidden={{ type: "batch", id: b.id, next: "/admin/batches" }}
          plan={deletePlan}
          submitLabel="Delete batch"
          blockedHint="To stop new students joining, set its status to Archived instead."
        />
      ) : null}
    </>
  );
}
