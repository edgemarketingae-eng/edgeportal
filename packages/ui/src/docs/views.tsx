import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "../components/button";
import { PageHeader } from "../shell/app-shell";
import { DocsGrid } from "./search";
import type { DocModule } from "./types";

/** The docs home: every module the reader can use, grouped and searchable. */
export function DocsIndex({
  modules,
  basePath,
  title = "Help & docs",
  intro,
}: {
  modules: DocModule[];
  basePath: string;
  title?: string;
  intro: string;
}) {
  return (
    <>
      <PageHeader title={title} description={intro} />
      <DocsGrid
        cards={modules.map((m) => {
          const Icon = m.icon;
          return {
            href: `${basePath}/${m.slug}`,
            title: m.title,
            summary: m.summary,
            group: m.group,
            icon: <Icon />,
            topics: m.sections.map((s) => s.title),
          };
        })}
      />
    </>
  );
}

/** One module: its sections with a sticky contents list, and links to the neighbouring modules. */
export function DocsArticle({ modules, slug, basePath }: { modules: DocModule[]; slug: string; basePath: string }) {
  const i = modules.findIndex((m) => m.slug === slug);
  const m = modules[i];
  if (!m) notFound();
  const prev = modules[i - 1];
  const next = modules[i + 1];
  const Icon = m.icon;
  return (
    <>
      <Link
        href={basePath}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm font-medium"
      >
        <ArrowLeft className="size-4" /> All guides
      </Link>
      <div className="mb-8 flex flex-wrap items-start gap-4">
        <span className="bg-edge-ink text-edge-green grid size-12 shrink-0 place-items-center rounded-xl [&_svg]:size-6">
          <Icon />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-xs font-bold tracking-[0.16em] uppercase">{m.group}</p>
          <h1 className="font-display text-2xl uppercase sm:text-3xl">{m.title}</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">{m.summary}</p>
        </div>
        {m.href ? (
          <Button asChild variant="outline">
            <Link href={m.href}>
              Open this page <ExternalLink />
            </Link>
          </Button>
        ) : null}
      </div>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <article className="grid min-w-0 gap-10">
          {m.sections.map((s) => (
            <section key={s.id} id={s.id} className="grid scroll-mt-20 gap-4">
              <h2 className="font-sans text-lg font-bold tracking-normal normal-case">{s.title}</h2>
              <div className="grid gap-4">{s.body}</div>
            </section>
          ))}
          <nav aria-label="More guides" className="grid gap-3 border-t pt-6 sm:grid-cols-2">
            {prev ? (
              <Link href={`${basePath}/${prev.slug}`} className="hover:border-edge-emerald/50 rounded-xl border p-4">
                <span className="text-muted-foreground flex items-center gap-1 text-xs">
                  <ArrowLeft className="size-3.5" /> Previous
                </span>
                <span className="font-semibold">{prev.title}</span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link href={`${basePath}/${next.slug}`} className="hover:border-edge-emerald/50 rounded-xl border p-4 text-right">
                <span className="text-muted-foreground flex items-center justify-end gap-1 text-xs">
                  Next <ArrowRight className="size-3.5" />
                </span>
                <span className="font-semibold">{next.title}</span>
              </Link>
            ) : null}
          </nav>
        </article>
        <aside className="hidden lg:block">
          <nav aria-label="On this page" className="sticky top-20 grid gap-1 border-l pl-4 text-sm">
            <p className="text-muted-foreground mb-1 text-xs font-bold tracking-[0.16em] uppercase">On this page</p>
            {m.sections.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="text-muted-foreground hover:text-foreground py-0.5 leading-snug">
                {s.title}
              </a>
            ))}
          </nav>
        </aside>
      </div>
    </>
  );
}
