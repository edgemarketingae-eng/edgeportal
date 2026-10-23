import { crmRoutes } from "@edge/contracts";
import { LEAD_SOURCES, LEAD_STAGES, LEAD_TEMPERATURES } from "@edge/domain/crm/enums";
import { LEAD_SOURCE_LABELS, LEAD_STAGE_LABELS, LEAD_TEMPERATURE_LABELS } from "@edge/domain/crm/labels";
import { FilterBar, FilterLink, FilterResults, FilterScope, FilterSelect } from "@edge/ui/blocks/filter-bar";
import { Button } from "@edge/ui/components/button";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LeadsTable } from "@/components/crm/leads-table";
import { QuickAddLead } from "@/components/crm/quick-add-dialog";
import { can, load, requireCrm } from "@/lib/load";

export const metadata: Metadata = { title: "Leads" };

const DUE_OPTIONS: [string, string][] = [
  ["overdue", "Overdue"],
  ["today", "Due today"],
  ["week", "Due this week"],
  ["none", "No follow-up"],
];
const CREATED_OPTIONS: [string, string][] = [
  ["today", "Today"],
  ["week", "Last 7 days"],
  ["month", "This month"],
];
const SORT_OPTIONS: [string, string][] = [
  ["created", "Newest"],
  ["followUp", "Next follow-up"],
  ["name", "Name"],
];

export default async function LeadsPage(props: PageProps<"/leads">) {
  const v = await requireCrm("crm.read");
  const sp = await props.searchParams;
  const one = (k: string) => (typeof sp[k] === "string" && sp[k] ? sp[k] : undefined);
  // Ignore unknown enum values instead of letting the API reject the whole request.
  const pick = <T extends string>(k: string, allowed: readonly T[]) => allowed.find((a) => a === one(k));
  const f = {
    q: one("q"),
    project: one("project"),
    stage: pick("stage", LEAD_STAGES),
    source: pick("source", LEAD_SOURCES),
    owner: one("owner"),
    temperature: pick("temperature", LEAD_TEMPERATURES),
    batch: one("batch"),
    due: pick("due", ["overdue", "today", "week", "none"] as const),
    created: pick("created", ["today", "week", "month"] as const),
    view: pick("view", ["open", "all"] as const),
    sort: pick("sort", ["recent", "created", "followUp", "name"] as const),
  };
  const [{ rows, total }, options] = await Promise.all([
    load(() => api(crmRoutes.leads, { query: f })),
    load(() => api(crmRoutes.options)),
  ]);
  const canWrite = can(v, "crm.write");
  // Bulk assignment targets: the team of the selected project, or everyone the viewer may assign to.
  const assignable = f.project
    ? options.projects.find((p) => p.id === f.project)?.canAssign
      ? (options.teams[f.project] ?? [])
      : []
    : options.projects.some((p) => p.canAssign)
      ? uniq(options.projects.filter((p) => p.canAssign).flatMap((p) => options.teams[p.id] ?? []))
      : [];
  const owners = uniq(Object.values(options.teams).flat());
  const qs = new URLSearchParams(Object.entries(sp).filter(([, x]) => typeof x === "string" && x) as [string, string][]);
  const current = [...qs.entries()]
    .sort()
    .map(([k, x]) => `${k}=${x}`)
    .join("&");
  const views: { label: string; query: string; show?: boolean }[] = [
    { label: "Open", query: "" },
    { label: "Mine", query: "owner=me" },
    { label: "Unassigned", query: "owner=unassigned" },
    { label: "Overdue", query: "due=overdue" },
    { label: "Hot", query: "temperature=HOT" },
    { label: "New today", query: "created=today&view=all" },
    { label: "Converted", query: "stage=CONVERTED" },
    { label: "Lost", query: "stage=LOST" },
    { label: "All", query: "view=all" },
  ];

  return (
    <FilterScope>
      <PageHeader
        title="Leads"
        description={`${total} lead${total === 1 ? "" : "s"}`}
        actions={
          <>
            {canWrite ? <QuickAddLead options={options} meId={v.user.id} /> : null}
            {canWrite ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/leads/new">Full form</Link>
              </Button>
            ) : null}
            <Button asChild variant="outline" size="sm">
              <a href={`/leads/export?${qs.toString()}`} download>
                <Download /> Export CSV
              </a>
            </Button>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap gap-1.5">
        {views.map((x) => {
          const active = x.query.split("&").filter(Boolean).sort().join("&") === current;
          return (
            <FilterLink
              key={x.label}
              href={`/leads${x.query ? `?${x.query}` : ""}`}
              aria-current={active ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${active ? "border-edge-emerald bg-edge-mint/40 text-edge-emerald" : "text-muted-foreground hover:text-foreground"}`}
            >
              {x.label}
            </FilterLink>
          );
        })}
      </div>
      <FilterBar q={f.q} placeholder="Search name, email, mobile, tag…">
        {f.view ? <input type="hidden" name="view" value={f.view} /> : null}
        <FilterSelect name="project" label="Project" value={f.project} options={options.projects.map((p) => [p.id, p.name])} />
        <FilterSelect name="stage" label="Stage" value={f.stage} options={LEAD_STAGES.map((s) => [s, LEAD_STAGE_LABELS[s]])} />
        <FilterSelect name="source" label="Source" value={f.source} options={LEAD_SOURCES.map((s) => [s, LEAD_SOURCE_LABELS[s]])} />
        <FilterSelect
          name="owner"
          label="Owner"
          value={f.owner}
          options={[["me", "Me"], ["unassigned", "Unassigned"], ...owners.map((o) => [o.id, o.name] as [string, string])]}
        />
        <FilterSelect
          name="temperature"
          label="Temperature"
          value={f.temperature}
          options={LEAD_TEMPERATURES.map((t) => [t, LEAD_TEMPERATURE_LABELS[t]])}
        />
        <FilterSelect name="batch" label="Batch" value={f.batch} options={options.batches.map((b) => [b.id, b.label])} />
        <FilterSelect name="due" label="Follow-up" value={f.due} options={DUE_OPTIONS} />
        <FilterSelect name="created" label="Created" value={f.created} options={CREATED_OPTIONS} />
        <FilterSelect name="sort" label="Sort" value={f.sort} options={SORT_OPTIONS} />
      </FilterBar>
      <FilterResults>
        <LeadsTable rows={rows} assignees={assignable} />
      </FilterResults>
    </FilterScope>
  );
}

function uniq(list: { id: string; name: string }[]) {
  const seen = new Map<string, { id: string; name: string }>();
  for (const x of list) if (x.id && !seen.has(x.id)) seen.set(x.id, x);
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}
