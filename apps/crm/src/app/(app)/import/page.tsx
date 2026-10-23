import { crmRoutes } from "@edge/contracts";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import { ImportForm } from "@/components/crm/import-form";
import { load, requireCrm } from "@/lib/load";

export const metadata: Metadata = { title: "Import leads" };

export default async function ImportLeadsPage() {
  const v = await requireCrm("crm.manage");
  const options = await load(() => api(crmRoutes.options));
  return (
    <>
      <PageHeader title="Import leads" description="Bring in a spreadsheet of enquiries, webinar sign-ups or an old lead list into a project." />
      <ImportForm options={options} meId={v.user.id} />
    </>
  );
}
