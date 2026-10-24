import { crmRoutes } from "@edge/contracts";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import { EMPTY_LEAD, LeadForm } from "@/components/crm/lead-form";
import { load, requireCrm } from "@/lib/load";

export const metadata: Metadata = { title: "New lead" };

export default async function NewLeadPage(props: PageProps<"/leads/new">) {
  const v = await requireCrm("crm.write");
  const [options, sp] = await Promise.all([load(() => api(crmRoutes.options)), props.searchParams]);
  const projectId = typeof sp.project === "string" && options.projects.some((p) => p.id === sp.project) ? sp.project : "";
  return (
    <>
      <PageHeader help="/docs/leads" title="New lead" description="Everything except name and a contact can be filled in later." />
      <LeadForm values={{ ...EMPTY_LEAD, projectId }} options={options} meId={v.user.id} />
    </>
  );
}
