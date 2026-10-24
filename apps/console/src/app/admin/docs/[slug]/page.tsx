import { adminDocs } from "@edge/ui/docs/content/console";
import { visibleModules } from "@edge/ui/docs/types";
import { DocsArticle } from "@edge/ui/docs/views";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/load";

export async function generateMetadata(props: PageProps<"/admin/docs/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  return { title: adminDocs.find((m) => m.slug === slug)?.title ?? "Help & docs" };
}

export default async function DocsArticlePage(props: PageProps<"/admin/docs/[slug]">) {
  const v = await requireStaff("admin.access");
  const { slug } = await props.params;
  return <DocsArticle modules={visibleModules(adminDocs, v.permissions)} slug={slug} basePath="/admin/docs" />;
}
