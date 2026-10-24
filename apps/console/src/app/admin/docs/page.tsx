import { adminDocs } from "@edge/ui/docs/content/console";
import { visibleModules } from "@edge/ui/docs/types";
import { DocsIndex } from "@edge/ui/docs/views";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Help & docs" };

export default async function DocsPage() {
  const v = await requireStaff("admin.access");
  return (
    <DocsIndex
      modules={visibleModules(adminDocs, v.permissions)}
      basePath="/admin/docs"
      intro="Step-by-step guides for the admin panel. You only see the parts your role can use."
    />
  );
}
