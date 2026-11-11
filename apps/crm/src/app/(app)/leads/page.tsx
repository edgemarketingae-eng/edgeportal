import { crmRoutes, LEAD_DATE_FIELDS, LEAD_SORTS } from "@edge/contracts";
import { LEAD_SOURCES, LEAD_STAGES, LEAD_TEMPERATURES } from "@edge/domain/crm/enums";
import { LEAD_SOURCE_LABELS, LEAD_STAGE_LABELS, LEAD_TEMPERATURE_LABELS } from "@edge/domain/crm/labels";
import { DateRangeFilter } from "@edge/ui/blocks/date-range-filter";
import { FilterBar, FilterLink, FilterResults, FilterScope, FilterSelect } from "@edge/ui/blocks/filter-bar";
import { Alert, AlertDescription } from "@edge/ui/components/alert";
import { Button } from "@edge/ui/components/button";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import { CircleCheck, Download, SearchX, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Pagination } from "@edge/ui/blocks/pagination";
import { LeadsTable } from "@/components/crm/leads-table";
import { QuickAddLead } from "@/components/crm/quick-add-dialog";
import { pageRange } from "@/lib/date-range";
import { can, load, requireCrm } from "@/lib/load";

export const metadata: Metadata = { title: "Leads" };

const DUE_OPTIONS: [string, string][] = [
  ["overdue", "Overdue"],
  ["today", "Due today"],
  ["week", "Due this week"],
  ["none", "No follow-up"],
];
/** Which date the date filter applies to (`on` in the URL; "created" when unset). */
const DATE_FIELD_OPTIONS: [string, string][] = [
  ["created", "Added"],
  ["activity", "Last activity"],
  ["followUp", "Next follow-up"],
];
/** Sort keys the older Sort select used, and the column each now means. */
const SORT_ALIASES: Record<string, string> = { recent: "activity", oldest: "created" };

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
    product: one("product"),
    due: pick("due", ["overdue", "today", "week", "none"] as const),
    view: pick("view", ["open", "all"] as const),
    sort: pick("sort", LEAD_SORTS),
    dir: pick("dir", ["asc", "desc"] as const),
    page: Number(one("page")) || 1,
    pageSize: Number(one("pageSize")) || 50,
  };
  // Today unless a range is picked or someone is searching (see pageRange); `created=` links still work.
  const dateOn = pick("on", LEAD_DATE_FIELDS) ?? "created";
  const dr = pageRange(sp, { searching: !!f.q, legacy: { param: "created", map: { today: "today", week: "7d", month: "month" } } });
  const query = { ...f, from: dr.from, to: dr.to, dateOn: dr.all ? undefined : dateOn };
  const [{ rows, total, page, pageSize }, options] = await Promise.all([
    load(() => api(crmRoutes.leads, { query })),
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
  // The URL's filters, without paging or flash params: what the sort headers keep and the view chips compare against.
  const qs = new URLSearchParams(
    Object.entries(sp).filter(([k, x]) => !["deleted", "page", "pageSize"].includes(k) && typeof x === "string" && x) as [string, string][],
  );
  // What the list actually shows, with the date range resolved (Today by default): export and "select all matching"
  // must cover exactly these leads.
  const shown = new URLSearchParams(
    Object.entries(query).filter(([k, x]) => !["page", "pageSize"].includes(k) && x != null && x !== "") as [string, string][],
  );
  const current = [...qs.entries()]
    .filter(([k]) => k !== "sort" && k !== "dir")
    .sort()
    .map(([k, x]) => `${k}=${x}`)
    .join("&");
  // The views are for working the pipeline, so they look across all dates (narrow them with the date filter).
  const views: { label: string; query: string; show?: boolean }[] = [
    { label: "Open", query: "" },
    { label: "Mine", query: "owner=me&range=all" },
    { label: "Unassigned", query: "owner=unassigned&range=all" },
    { label: "Overdue", query: "due=overdue&range=all" },
    { label: "Hot", query: "temperature=HOT&range=all" },
    { label: "New today", query: "range=today&view=all" },
    { label: "Converted", query: "stage=CONVERTED&range=all" },
    { label: "Lost", query: "stage=LOST&range=all" },
    { label: "All", query: "view=all&range=all" },
  ];
  const sortKey = f.sort ? (SORT_ALIASES[f.sort] ?? f.sort) : "activity";
  const sortDir = f.dir ?? (f.sort === "oldest" ? "asc" : ["activity", "created"].includes(sortKey) ? "desc" : "asc");

  return (
    <FilterScope>
      <PageHeader
        help="/docs/leads"
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
              <a href={`/leads/export?${shown.toString()}`} download>
                <Download /> Export CSV
              </a>
            </Button>
          </>
        }
      />
      {sp.deleted ? (
        <Alert variant="success" className="mb-4">
          <CircleCheck aria-hidden />
          <AlertDescription>Lead deleted.</AlertDescription>
        </Alert>
      ) : null}
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
      <FilterBar q={f.q} placeholder="Search name, mobile, email, JetaFX ID, notes…">
        {f.view ? <input type="hidden" name="view" value={f.view} /> : null}
        {/* The column headers set the sort; filters keep it. */}
        {f.sort ? <input type="hidden" name="sort" value={f.sort} /> : null}
        {f.dir ? <input type="hidden" name="dir" value={f.dir} /> : null}
        <DateRangeFilter {...dr.filter} field={{ name: "on", value: dateOn, defaultValue: "created", options: DATE_FIELD_OPTIONS }} />
        <FilterSelect name="project" label="Project" value={f.project} options={options.projects.map((p) => [p.id, p.name])} />
        <FilterSelect name="stage" label="Stage" value={f.stage} options={LEAD_STAGES.map((s) => [s, LEAD_STAGE_LABELS[s]])} />
        <FilterSelect name="source" label="Source" value={f.source} options={LEAD_SOURCES.map((s) => [s, LEAD_SOURCE_LABELS[s]])} />
        {options.products.length ? (
          <FilterSelect
            name="product"
            label="Converted to"
            allLabel="Converted to: any"
            value={f.product}
            options={options.products.map((p) => [p.id, p.name])}
          />
        ) : null}
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
      </FilterBar>
      <FilterResults>
        <LeadsTable
          rows={rows}
          total={total}
          filters={shown.toString()}
          sort={{ current: { sort: sortKey, dir: sortDir }, query: qs.toString() }}
          assignees={assignable}
          canDelete={can(v, "crm.leads.delete")}
          empty={
            qs.toString() || !dr.all
              ? {
                  icon: <SearchX />,
                  title: "No leads match these filters.",
                  children: dr.all
                    ? "Try another view, or clear the filters."
                    : `Nothing for ${dr.filter.label.toLowerCase()}. Try a wider date range.`,
                  action: (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/leads?${new URLSearchParams({ ...Object.fromEntries(qs), range: "all" })}`}>All dates</Link>
                    </Button>
                  ),
                }
              : {
                  icon: <UsersRound />,
                  title: "No open leads",
                  children: "New leads from the website, landing pages, imports and quick add show up here.",
                  action: (
                    <>
                      {canWrite ? (
                        <Button asChild size="sm">
                          <Link href="/leads/new">Add a lead</Link>
                        </Button>
                      ) : null}
                      <Button asChild size="sm" variant="outline">
                        <Link href="/leads?view=all&range=all">See all leads</Link>
                      </Button>
                    </>
                  ),
                }
          }
        />
        <Pagination page={page} pageSize={pageSize} total={total} noun="leads" />
      </FilterResults>
    </FilterScope>
  );
}

function uniq(list: { id: string; name: string }[]) {
  const seen = new Map<string, { id: string; name: string }>();
  for (const x of list) if (x.id && !seen.has(x.id)) seen.set(x.id, x);
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}
