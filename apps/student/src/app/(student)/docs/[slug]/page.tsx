import { studentDocs } from "@edge/ui/docs/content/student";
import { visibleModules } from "@edge/ui/docs/types";
import { DocsArticle } from "@edge/ui/docs/views";
import type { Metadata } from "next";
import { requireStudent } from "@/lib/load";

export async function generateMetadata(props: PageProps<"/docs/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  return { title: studentDocs.find((m) => m.slug === slug)?.title ?? "Help & docs" };
}

export default async function DocsArticlePage(props: PageProps<"/docs/[slug]">) {
  await requireStudent();
  const { slug } = await props.params;
  return <DocsArticle modules={visibleModules(studentDocs, undefined)} slug={slug} basePath="/docs" />;
}
