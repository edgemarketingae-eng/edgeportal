import { crmRoutes } from "@edge/contracts";
import { CRM_PERMISSIONS, PERMISSIONS } from "@edge/domain/auth/permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@edge/ui/components/card";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import { RoleForm } from "@/components/team/team-forms";
import { can, load, requireCrm } from "@/lib/load";

export const metadata: Metadata = { title: "CRM roles" };

const perms = CRM_PERMISSIONS.map((k) => [k, PERMISSIONS[k]] as [string, string]);

export default async function RolesPage() {
  const v = await requireCrm("crm.staff.manage");
  const editable = can(v, "crm.roles.manage");
  const roles = await load(() => api(crmRoutes.roles));
  return (
    <>
      <PageHeader
        title="CRM roles & permissions"
        description={editable ? "A person can hold several roles; permissions add up. Only CRM permissions can be granted here." : "Only a CRM admin can edit roles."}
      />
      <div className="grid gap-4">
        {roles.map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle>
                {r.name} <span className="text-muted-foreground text-sm font-normal">· {r.members} people</span>
              </CardTitle>
              {r.isSystem ? <CardDescription>Built-in role: its permissions are restored on every deploy. To customise, create a new role below instead.</CardDescription> : null}
            </CardHeader>
            <CardContent>
              <RoleForm role={r} permissions={perms} disabled={!editable || r.isSystem} />
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
