import { staffRoutes } from "@edge/contracts";
import { formatDateTime } from "@edge/domain/dates";
import { ActionButton } from "@edge/ui/blocks/action-dialog";
import { PendingInvite } from "@edge/ui/blocks/secret-reveal";
import { Card, CardContent, CardHeader, CardTitle } from "@edge/ui/components/card";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import { toggleStaffAction } from "@/app/admin/staff/actions";
import { EditStaffForm, ResetPasswordButton } from "@/components/staff/staff-forms";
import { load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Staff member" };

export default async function StaffMemberPage(props: PageProps<"/admin/staff/[id]">) {
  await requireStaff("staff.manage");
  const { id } = await props.params;
  const [s, roles] = await Promise.all([load(() => api(staffRoutes.get, { params: { id } })), load(() => api(staffRoutes.roles))]);
  return (
    <>
      <PageHeader
        help="/admin/docs/staff"
        title={s.name}
        description={`${s.email}${s.disabled ? " · disabled" : ""}${s.lastSignInAt ? ` · last sign-in ${formatDateTime(s.lastSignInAt)}` : ""}`}
        actions={
          <>
            <ResetPasswordButton userId={s.id} />
            <ActionButton
              action={toggleStaffAction}
              hidden={{ userId: s.id, disable: s.disabled ? "0" : "1" }}
              variant={s.disabled ? "default" : "destructive"}
            >
              {s.disabled ? "Enable account" : "Disable account"}
            </ActionButton>
          </>
        }
      />
      <PendingInvite invited={s.invited} disabled={s.disabled} tempPassword={s.tempPassword} />
      <Card>
        <CardHeader>
          <CardTitle>Details and roles</CardTitle>
        </CardHeader>
        <CardContent>
          <EditStaffForm
            roles={roles}
            user={{
              id: s.id,
              name: s.name,
              title: s.title ?? "",
              workspaceEmail: s.workspaceEmail ?? "",
              roleKeys: s.roles.map((r) => r.key),
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
