import { crmRoutes, type CallReportRow } from "@edge/contracts";
import { talkTime } from "@edge/domain/crm/machine";
import { formatDateTime } from "@edge/domain/dates";
import { ActionDialog } from "@edge/ui/blocks/action-dialog";
import { DateRangeFilter } from "@edge/ui/blocks/date-range-filter";
import { FilterBar, FilterResults, FilterScope, FilterSelect } from "@edge/ui/blocks/filter-bar";
import { StatCard } from "@edge/ui/blocks/stat-card";
import { Badge } from "@edge/ui/components/badge";
import { Button } from "@edge/ui/components/button";
import { Card } from "@edge/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@edge/ui/components/table";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import { removeDeviceAction } from "@/lib/actions/calls";
import { pageRange } from "@/lib/date-range";
import { load, requireCrm } from "@/lib/load";

export const metadata: Metadata = { title: "Calls" };

function PhoneStatus({ device }: { device: CallReportRow["device"] }) {
  if (!device) return <Badge variant="secondary">No phone</Badge>;
  if (device.status === "off") return <Badge variant="destructive">Tracking off</Badge>;
  if (device.status === "silent") return <Badge variant="destructive">Not syncing</Badge>;
  return <Badge variant="outline">Tracking</Badge>;
}

export default async function CallsPage(props: PageProps<"/calls">) {
  await requireCrm("crm.calls.read");
  const sp = await props.searchParams;
  // Today unless a range is picked; older `period=` links map onto a range.
  const dr = pageRange(sp, { legacy: { param: "period", map: { today: "today", week: "7d", month: "month", lastMonth: "lastMonth" } } });
  const project = typeof sp.project === "string" && sp.project ? sp.project : undefined;
  const range = dr.all ? { period: "all" as const } : { from: dr.from, to: dr.to };
  const [report, options] = await Promise.all([
    load(() => api(crmRoutes.callReport, { query: { ...range, project } })),
    load(() => api(crmRoutes.options)),
  ]);
  const { rows, totals, canManageDevices } = report;

  return (
    <FilterScope>
      <PageHeader
        help="/docs/calls"
        title="Calls"
        description={`${dr.filter.label} · SIM calls with leads, from the phone app`}
        actions={
          <FilterBar search={false} className="mb-0">
            <DateRangeFilter {...dr.filter} prefix="Period" />
            <FilterSelect
              name="project"
              label="Project"
              allLabel="All projects"
              value={project}
              options={options.projects.map((p) => [p.id, p.name])}
            />
          </FilterBar>
        }
      />
      <FilterResults>
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <StatCard label="Calls" value={totals.calls} hint="answered or not" />
          <StatCard label="Connected" value={totals.connected} hint="answered, or 5 seconds or longer" />
          <StatCard label="Talk time" value={talkTime(totals.talkSec)} />
        </div>
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Connected</TableHead>
                <TableHead className="text-right">Talk time</TableHead>
                <TableHead className="text-right">Leads called</TableHead>
                {canManageDevices ? <TableHead>Phone</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.userId}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.calls}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.connected}</TableCell>
                  <TableCell className="text-right tabular-nums">{talkTime(r.talkSec)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.leads}</TableCell>
                  {canManageDevices ? (
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <PhoneStatus device={r.device} />
                        {r.device ? (
                          <>
                            <span className="text-muted-foreground text-xs">
                              {[
                                r.device.model,
                                r.device.appVersion && `v${r.device.appVersion}`,
                                r.device.lastSyncAt && `synced ${formatDateTime(r.device.lastSyncAt)}`,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                            <ActionDialog
                              action={removeDeviceAction}
                              hidden={{ deviceId: r.device.id }}
                              title={`Remove ${r.name}'s phone?`}
                              description="For a lost or replaced phone. It's signed out straight away, and calls on it stop being tracked until someone signs in again."
                              trigger={
                                <Button size="sm" variant="ghost">
                                  Remove
                                </Button>
                              }
                              submitLabel="Remove phone"
                              destructive
                            />
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </FilterResults>
    </FilterScope>
  );
}
