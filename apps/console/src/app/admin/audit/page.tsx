import { adminRoutes } from "@edge/contracts";
import { formatDateTime } from "@edge/domain/dates";
import { TableEmpty } from "@edge/ui/blocks/empty-state";
import { FilterBar, FilterResults, FilterScope } from "@edge/ui/blocks/filter-bar";
import { Card } from "@edge/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@edge/ui/components/table";
import { Pagination } from "@edge/ui/blocks/pagination";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import { load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage(props: PageProps<"/admin/audit">) {
  await requireStaff("audit.read");
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" && sp.q ? sp.q : undefined;
  const data = await load(() => api(adminRoutes.audit, { query: { q, page: Number(sp.page) || 1, pageSize: Number(sp.pageSize) || 50 } }));
  const rows = data.rows;
  return (
    <FilterScope>
      <PageHeader
        help="/admin/docs/audit"
        title="Audit log"
        description="Every sensitive change: approvals, locks, payments, fees, roles and settings."
      />
      <FilterBar q={q} placeholder="Action, entity or ID…" />
      <FilterResults>
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="hidden md:table-cell">Entity</TableHead>
                <TableHead className="hidden lg:table-cell">Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? <TableEmpty colSpan={5} title="No audit entries match." /> : null}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{formatDateTime(r.createdAt)}</TableCell>
                  <TableCell>{r.actor}</TableCell>
                  <TableCell className="font-mono text-xs">{r.action}</TableCell>
                  <TableCell className="hidden font-mono text-xs md:table-cell">
                    {r.entityType}:{r.entityId.slice(0, 10)}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden max-w-md truncate font-mono text-[11px] lg:table-cell">
                    {r.after ? JSON.stringify(r.after) : ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} noun="entries" />
      </FilterResults>
    </FilterScope>
  );
}
