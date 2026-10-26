import { staffRoutes } from "@edge/contracts";
import { StaffStatus } from "@edge/ui/blocks/secret-reveal";
import { Badge } from "@edge/ui/components/badge";
import { Button } from "@edge/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@edge/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@edge/ui/components/table";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import Link from "next/link";
import { CreateStaffForm } from "@/components/staff/staff-forms";
import { load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Staff" };

export default async function StaffPage() {
  await requireStaff("staff.manage");
  const [staff, roles] = await Promise.all([load(() => api(staffRoutes.list)), load(() => api(staffRoutes.roles))]);
  return (
    <>
      <PageHeader
        help="/admin/docs/staff"
        title="Staff & roles"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/staff/roles">Roles & permissions</Link>
          </Button>
        }
      />
      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">Email</TableHead>
              <TableHead className="hidden lg:table-cell">Phone</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <Link href={`/admin/staff/${s.id}`} className="text-edge-emerald font-semibold hover:underline">
                    {s.name}
                  </Link>
                  {s.title ? <div className="text-muted-foreground text-xs">{s.title}</div> : null}
                </TableCell>
                <TableCell className="hidden md:table-cell">{s.email}</TableCell>
                <TableCell className="hidden lg:table-cell">{s.phone ?? <span className="text-muted-foreground">-</span>}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {s.roles.map((r) => (
                      <Badge key={r.key} variant="outline">
                        {r.name}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <StaffStatus disabled={s.disabled} invited={s.invited} tempPassword={s.tempPassword} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Add a staff member</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateStaffForm roles={roles} />
        </CardContent>
      </Card>
    </>
  );
}
