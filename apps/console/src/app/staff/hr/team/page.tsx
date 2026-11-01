import { hrRoutes } from "@edge/contracts";
import { formatDate } from "@edge/domain/dates";
import { TableEmpty } from "@edge/ui/blocks/empty-state";
import { Badge } from "@edge/ui/components/badge";
import { Card } from "@edge/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@edge/ui/components/table";
import { tone } from "@edge/ui/lib/tones";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import Link from "next/link";
import { load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  await requireStaff("hr.manage");
  const team = await load(() => api(hrRoutes.team));
  return (
    <>
      <PageHeader
        help="/staff/docs/hr-team"
        title="Team"
        description="Every staff account. New logins from Staff & roles or CRM Team appear here to set up."
      />
      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">Department</TableHead>
              <TableHead className="hidden md:table-cell">Joined</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {team.length === 0 ? <TableEmpty colSpan={4} title="No staff accounts yet." /> : null}
            {team.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link href={`/staff/hr/team/${p.id}`} className="text-edge-emerald font-semibold hover:underline">
                    {p.name}
                  </Link>
                  <div className="text-muted-foreground text-xs">{p.title ?? p.email}</div>
                </TableCell>
                <TableCell className="hidden md:table-cell">{p.department ?? <span className="text-muted-foreground">-</span>}</TableCell>
                <TableCell className="hidden md:table-cell">
                  {p.joinedOn ? formatDate(p.joinedOn) : <span className="text-muted-foreground">-</span>}
                </TableCell>
                <TableCell>
                  {!p.setUp ? (
                    <Badge variant="outline" className={tone.warning}>
                      Not set up
                    </Badge>
                  ) : p.leftOn ? (
                    <Badge variant="outline" className={tone.gray}>
                      Left {formatDate(p.leftOn)}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className={tone.success}>
                      Active
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
