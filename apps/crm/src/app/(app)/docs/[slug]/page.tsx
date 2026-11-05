import { crmDocs } from "@edge/ui/docs/content/crm";
import { visibleModules } from "@edge/ui/docs/types";
import { DocsArticle } from "@edge/ui/docs/views";
import type { Metadata } from "next";
import { requireCrm } from "@/lib/load";

export async function generateMetadata(props: PageProps<"/docs/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  return { title: crmDocs.find((m) => m.slug === slug)?.title ?? "Help & docs" };
}

export default async function DocsArticlePage(props: PageProps<"/docs/[slug]">) {
  const v = await requireCrm("crm.access");
  const { slug } = await props.params;
  // Code samples show this server's public API host (the root .env, loaded by next.config.ts).
  const apiUrl = (process.env.API_PUBLIC_URL ?? "https://api.edgeacademy.ae").replace(/\/+$/, "");
  return <DocsArticle modules={visibleModules(crmDocs, v.permissions)} slug={slug} basePath="/docs" context={{ apiUrl }} />;
}
