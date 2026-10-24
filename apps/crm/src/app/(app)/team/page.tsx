import { crmRoutes } from "@edge/contracts";
import { StaffStatus } from "@edge/ui/blocks/secret-reveal";
import { Badge } from "@edge/ui/components/badge";
import { Button } from "@edge/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@edge/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@edge/ui/components/table";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import Link from "next/link";
import { CreateCrmStaffForm } from "@/components/team/team-forms";
import { load, requireCrm } from "@/lib/load";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  await requireCrm("crm.staff.manage");
  const [staff, roles, options] = await Promise.all([
    load(() => api(crmRoutes.team)),
    load(() => api(crmRoutes.roles)),
    load(() => api(crmRoutes.options)),
  ]);
  return (
    <>
      <PageHeader
        help="/docs/team"
        title="Team"
        description="CRM staff. Accounts that also hold academy roles are managed from the admin console."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/team/roles">Roles & permissions</Link>
          </Button>
        }
      />
      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">Email</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead className="hidden lg:table-cell">Projects</TableHead>
              <TableHead className="text-right">Open leads</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-10 text-center">
                  No CRM staff yet. Add the first account below.
                </TableCell>
              </TableRow>
            ) : (
              staff.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link href={`/team/${s.id}`} className="text-edge-emerald font-semibold hover:underline">
                      {s.name}
                    </Link>
                    {s.title ? <div className="text-muted-foreground text-xs">{s.title}</div> : null}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{s.email}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {s.roles.map((r) => (
                        <Badge key={r.key} variant="outline">
                          {r.name}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="text-muted-foreground flex flex-wrap gap-x-2 text-xs">
                      {s.projects.map((p) => (
                        <Link key={p.id} href={`/projects/${p.id}`} className="hover:underline">
                          {p.name}
                          {p.role === "manager" ? " (PM)" : ""}
                        </Link>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{s.openLeads}</TableCell>
                  <TableCell>
                    <StaffStatus disabled={s.disabled} invited={s.invited} tempPassword={s.tempPassword} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Add a CRM account</CardTitle>
          <CardDescription>They receive a temporary password by email and sign in at this CRM.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateCrmStaffForm roles={roles} projects={options.projects.filter((p) => !p.isDefault)} />
        </CardContent>
      </Card>
    </>
  );
}
