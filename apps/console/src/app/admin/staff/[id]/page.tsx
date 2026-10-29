import { staffRoutes } from "@edge/contracts";
import { formatDateTime } from "@edge/domain/dates";
import { ActionButton, ActionDialog } from "@edge/ui/blocks/action-dialog";
import { Button } from "@edge/ui/components/button";
import { AvailabilitySwitch } from "@edge/ui/blocks/availability";
import { PendingInvite } from "@edge/ui/blocks/secret-reveal";
import { Card, CardContent, CardHeader, CardTitle } from "@edge/ui/components/card";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import { toggleStaffAction, toggleStaffAvailableAction } from "@/app/admin/staff/actions";
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
        back={{ href: "/admin/staff", label: "Staff" }}
        help="/admin/docs/staff"
        title={s.name}
        description={`${s.email}${s.disabled ? " · disabled" : ""}${s.available ? "" : " · Off"}${s.lastSignInAt ? ` · last sign-in ${formatDateTime(s.lastSignInAt)}` : ""}`}
        actions={
          <>
            {/* Only sales executives receive automatic leads, so only they can be marked Off. */}
            {s.roles.some((r) => r.key === "sales_executive") || !s.available ? (
              <AvailabilitySwitch action={toggleStaffAvailableAction} userId={s.id} name={s.name} available={s.available} showLabel />
            ) : null}
            <ResetPasswordButton userId={s.id} />
            {s.disabled ? (
              <ActionButton action={toggleStaffAction} hidden={{ userId: s.id, disable: "0" }}>
                Enable account
              </ActionButton>
            ) : (
              <ActionDialog
                action={toggleStaffAction}
                hidden={{ userId: s.id, disable: "1" }}
                title={`Disable ${s.name}'s account?`}
                description="They are signed out and can't sign in until the account is enabled again. Their history stays."
                trigger={
                  <Button size="sm" variant="destructive">
                    Disable account
                  </Button>
                }
                submitLabel="Disable account"
                destructive
              />
            )}
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
              phone: s.phone ?? "",
              roleKeys: s.roles.map((r) => r.key),
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
