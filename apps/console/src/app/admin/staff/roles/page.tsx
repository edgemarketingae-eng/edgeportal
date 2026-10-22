import { staffRoutes } from "@edge/contracts";
import { PERMISSIONS } from "@edge/domain/auth/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@edge/ui/components/card";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import { RoleForm } from "@/components/staff/staff-forms";
import { can, load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Roles" };

const perms = Object.entries(PERMISSIONS) as [string, string][];

export default async function RolesPage() {
  const v = await requireStaff("staff.manage");
  const editable = can(v, "roles.manage");
  const roles = await load(() => api(staffRoutes.roles));
  return (
    <>
      <PageHeader
        title="Roles & permissions"
        description={editable ? "A person can hold several roles. Their permissions add up." : "Only a super admin can edit roles."}
      />
      <div className="grid gap-4">
        {roles.map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle>
                {r.name} <span className="text-muted-foreground text-sm font-normal">· {r.members} people</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RoleForm role={r} permissions={perms} disabled={!editable || r.key === "super_admin"} />
            </CardContent>
          </Card>
        ))}
        {editable ? (
          <Card>
            <CardHeader>
              <CardTitle>New role</CardTitle>
            </CardHeader>
            <CardContent>
              <RoleForm permissions={perms} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
