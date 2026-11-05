import { crmRoutes } from "@edge/contracts";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import { EMPTY_PROJECT, ProjectForm } from "@/components/crm/project-form";
import { can, load, requireCrm } from "@/lib/load";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage() {
  const v = await requireCrm("crm.projects.manage");
  const options = await load(() => api(crmRoutes.options));
  return (
    <>
      <PageHeader
        help="/docs/projects"
        title="New project"
        description="A campaign or pipeline with its own team. Leads and tasks live inside it."
      />
      <ProjectForm
        values={EMPTY_PROJECT}
        staff={options.staff}
        courses={options.courses}
        batches={options.batches}
        products={options.products}
        canSetManagers
        canSetProducts={can(v, "crm.manage")}
      />
    </>
  );
}
