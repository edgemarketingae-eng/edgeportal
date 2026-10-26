import { crmRoutes } from "@edge/contracts";
import { formatDateTime } from "@edge/domain/dates";
import { ActionButton } from "@edge/ui/blocks/action-dialog";
import { AvailabilitySwitch } from "@edge/ui/blocks/availability";
import { PendingInvite } from "@edge/ui/blocks/secret-reveal";
import { Card, CardContent, CardHeader, CardTitle } from "@edge/ui/components/card";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import Link from "next/link";
import { EditCrmStaffForm, ResetPasswordButton } from "@/components/team/team-forms";
import { toggleCrmStaffAction, toggleCrmStaffAvailableAction } from "@/lib/actions/team";
import { load, requireCrm } from "@/lib/load";

export const metadata: Metadata = { title: "Team member" };

export default async function TeamMemberPage(props: PageProps<"/team/[id]">) {
  await requireCrm("crm.staff.manage");
  const { id } = await props.params;
  const [s, roles] = await Promise.all([load(() => api(crmRoutes.staff, { params: { id } })), load(() => api(crmRoutes.roles))]);
  return (
    <>
      <PageHeader
        help="/docs/team"
        title={s.name}
        description={`${s.email}${s.disabled ? " · disabled" : ""}${s.available ? "" : " · Off"}${s.lastSignInAt ? ` · last sign-in ${formatDateTime(s.lastSignInAt)}` : ""} · ${s.openLeads} open lead${s.openLeads === 1 ? "" : "s"}`}
        actions={
          <>
            {s.roles.some((r) => r.key === "sales_executive") || !s.available ? (
              <AvailabilitySwitch action={toggleCrmStaffAvailableAction} userId={s.id} name={s.name} available={s.available} showLabel />
            ) : null}
            <ResetPasswordButton userId={s.id} />
            <ActionButton
              action={toggleCrmStaffAction}
              hidden={{ userId: s.id, disable: s.disabled ? "0" : "1" }}
              variant={s.disabled ? "default" : "destructive"}
            >
              {s.disabled ? "Enable account" : "Disable account"}
            </ActionButton>
          </>
        }
      />
      <PendingInvite invited={s.invited} disabled={s.disabled} tempPassword={s.tempPassword} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Details and roles</CardTitle>
          </CardHeader>
          <CardContent>
            <EditCrmStaffForm
              roles={roles}
              user={{
                id: s.id,
                name: s.name,
                title: s.title ?? "",
                workspaceEmail: s.workspaceEmail ?? "",
                phone: s.phone ?? "",
                roleKeys: s.roles.map((r) => r.key),
              }}
            />
          </CardContent>
        </Card>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Projects</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {s.projects.length === 0 ? (
              <p className="text-muted-foreground">Not on any project team. Add them from a project page.</p>
            ) : null}
            {s.projects.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="text-edge-emerald hover:underline">
                {p.name} <span className="text-muted-foreground">· {p.role === "manager" ? "project manager" : "sales executive"}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
