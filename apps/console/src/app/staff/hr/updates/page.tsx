import { hrRoutes, type WorkUpdatesDay } from "@edge/contracts";
import { formatDate, formatTime } from "@edge/domain/dates";
import { EmptyState } from "@edge/ui/blocks/empty-state";
import { Pagination } from "@edge/ui/blocks/pagination";
import { Badge } from "@edge/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@edge/ui/components/card";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import { ListChecks } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DeleteButton } from "@/components/delete-button";
import { DayNav, PersonPicker, Points } from "@/components/hr/work-update-form";
import { can, load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Team updates" };

const BASE = "/staff/hr/updates";
const OFF_LABEL: Record<NonNullable<WorkUpdatesDay["missing"][number]["off"]>, string> = {
  LEAVE: "On leave",
  WEEKLY_OFF: "Weekly off",
  HOLIDAY: "Holiday",
};

export default async function TeamUpdatesPage(props: PageProps<"/staff/hr/updates">) {
  const v = await requireStaff("hr.manage");
  const purge = can(v, "records.delete");
  const sp = await props.searchParams;
  const person = typeof sp.person === "string" && sp.person ? sp.person : undefined;
  const team = await load(() => api(hrRoutes.team));
  const people = team.filter((t) => !t.disabled).map((t) => ({ id: t.id, name: t.name }));
  return person ? (
    <PersonView id={person} people={people} page={Number(sp.page) || 1} pageSize={Number(sp.pageSize) || 25} purge={purge} />
  ) : (
    <DayView day={typeof sp.day === "string" ? sp.day : undefined} people={people} purge={purge} />
  );
}

async function DayView({ day, people, purge }: { day?: string; people: { id: string; name: string }[]; purge: boolean }) {
  const d = await load(() => api(hrRoutes.updatesDay, { query: { day } }));
  const isToday = d.day === d.today;
  return (
    <>
      <PageHeader
        help="/staff/docs/hr-work-updates"
        title="Team updates"
        description={isToday ? "What everyone worked on today." : `What everyone worked on, ${formatDate(d.day)}.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <PersonPicker people={people} basePath={BASE} />
            <DayNav day={d.day} max={d.today} basePath={BASE} />
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="grid content-start gap-3">
          {d.rows.length === 0 ? (
            <Card>
              <EmptyState icon={<ListChecks />} title={isToday ? "Nobody has written an update yet today." : "No updates for this day."} />
            </Card>
          ) : (
            d.rows.map((r) => (
              <Card key={r.person.id}>
                <CardContent className="grid gap-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link href={`${BASE}?person=${r.person.id}`} className="font-semibold hover:underline">
                      {r.person.name}
                    </Link>
                    <span className="text-muted-foreground flex items-center gap-1 text-xs">
                      {r.person.title ? `${r.person.title}, ` : ""}saved {formatTime(r.updatedAt)}
                      {purge ? <DeleteButton type="workUpdate" id={r.id} iconOnly label="Delete update" /> : null}
                    </span>
                  </div>
                  <Points items={r.items} />
                </CardContent>
              </Card>
            ))
          )}
        </div>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Not logged yet ({d.missing.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {d.missing.length === 0 ? (
              <p className="text-muted-foreground text-sm">Everyone has written one.</p>
            ) : (
              <ul className="divide-y text-sm">
                {d.missing.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                    <Link href={`${BASE}?person=${m.id}`} className="min-w-0 truncate hover:underline">
                      {m.name}
                    </Link>
                    {m.off ? <Badge variant="outline">{OFF_LABEL[m.off]}</Badge> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

async function PersonView({
  id,
  people,
  page,
  pageSize,
  purge,
}: {
  id: string;
  people: { id: string; name: string }[];
  page: number;
  pageSize: number;
  purge: boolean;
}) {
  const p = await load(() => api(hrRoutes.personUpdates, { params: { id }, query: { page, pageSize } }));
  return (
    <>
      <PageHeader
        help="/staff/docs/hr-work-updates"
        back={{ href: BASE, label: "Team updates" }}
        title={p.person.name}
        description={p.person.title ?? "Work updates, newest first."}
        actions={<PersonPicker people={people} value={id} basePath={BASE} />}
      />
      {p.rows.length === 0 ? (
        <Card>
          <EmptyState icon={<ListChecks />} title={`${p.person.name} hasn't written any updates yet.`} />
        </Card>
      ) : (
        <div className="grid gap-3">
          {p.rows.map((r) => (
            <Card key={r.day}>
              <CardContent className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`${BASE}?day=${r.day}`} className="text-sm font-semibold hover:underline">
                    {formatDate(r.day)}
                  </Link>
                  {purge ? <DeleteButton type="workUpdate" id={r.id} iconOnly label="Delete update" /> : null}
                </div>
                <Points items={r.items} />
              </CardContent>
            </Card>
          ))}
          <Pagination page={p.page} pageSize={p.pageSize} total={p.total} noun="days" defaultSize={25} />
        </div>
      )}
    </>
  );
}
