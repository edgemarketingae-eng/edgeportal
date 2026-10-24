import { crmDocs } from "@edge/ui/docs/content/crm";
import { visibleModules } from "@edge/ui/docs/types";
import { DocsIndex } from "@edge/ui/docs/views";
import type { Metadata } from "next";
import { requireCrm } from "@/lib/load";

export const metadata: Metadata = { title: "Help & docs" };

export default async function DocsPage() {
  const v = await requireCrm("crm.access");
  return (
    <DocsIndex
      modules={visibleModules(crmDocs, v.permissions)}
      basePath="/docs"
      intro="Step-by-step guides for the CRM. You only see the parts your role can use."
    />
  );
}
