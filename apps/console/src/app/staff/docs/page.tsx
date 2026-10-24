import { staffDocs } from "@edge/ui/docs/content/console";
import { visibleModules } from "@edge/ui/docs/types";
import { DocsIndex } from "@edge/ui/docs/views";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Help & docs" };

export default async function DocsPage() {
  const v = await requireStaff("staff.access");
  return (
    <DocsIndex
      modules={visibleModules(staffDocs, v.permissions)}
      basePath="/staff/docs"
      intro="How to run your batches, live classes and recordings from the staff portal."
    />
  );
}
