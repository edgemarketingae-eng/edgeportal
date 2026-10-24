import { studentDocs } from "@edge/ui/docs/content/student";
import { visibleModules } from "@edge/ui/docs/types";
import { DocsIndex } from "@edge/ui/docs/views";
import type { Metadata } from "next";
import { requireStudent } from "@/lib/load";

export const metadata: Metadata = { title: "Help & docs" };

export default async function DocsPage() {
  await requireStudent();
  return (
    <DocsIndex
      modules={visibleModules(studentDocs, undefined)}
      basePath="/docs"
      intro="Everything you need to know about your student portal: paying, joining classes and watching recordings."
    />
  );
}
