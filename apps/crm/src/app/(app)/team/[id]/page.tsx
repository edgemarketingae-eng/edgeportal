import { crmRoutes } from "@edge/contracts";
import { DEPOSIT_SEQUENCE_LABELS } from "@edge/domain/crm/labels";
import { formatDate, formatDateTime } from "@edge/domain/dates";
import { formatMoney } from "@edge/domain/money";
import { ActionButton, ActionDialog } from "@edge/ui/blocks/action-dialog";
import { Button } from "@edge/ui/components/button";
import { AvailabilitySwitch } from "@edge/ui/blocks/availability";
import { PendingInvite } from "@edge/ui/blocks/secret-reveal";
import { DepositStatusBadge } from "@edge/ui/blocks/status-badges";
import { Card, CardContent, CardHeader, CardTitle } from "@edge/ui/components/card";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import Link from "next/link";
import { EditCrmStaffForm, ResetPasswordButton } from "@/components/team/team-forms";
import { toggleCrmStaffAction, toggleCrmStaffAvailableAction } from "@/lib/actions/team";
import { can, load, requireCrm } from "@/lib/load";

export const metadata: Metadata = { title: "Team member" };

export default async function TeamMemberPage(props: PageProps<"/team/[id]">) {
  const v = await requireCrm("crm.staff.manage");
  const { id } = await props.params;
  const [s, roles, c] = await Promise.all([
    load(() => api(crmRoutes.staff, { params: { id } })),
    load(() => api(crmRoutes.roles)),
    can(v, "crm.commission.manage") ? load(() => api(crmRoutes.staffCommission, { params: { id } })) : null,
  ]);
  const usd = (minor: number) => formatMoney(minor, "USD");
  return (
    <>
      <PageHeader
        back={{ href: "/team", label: "Team" }}
        help="/docs/team"
        title={s.name}
        description={`${s.email}${s.disabled ? " · disabled" : ""}${s.available ? "" : " · Off"}${s.lastSignInAt ? ` · last sign-in ${formatDateTime(s.lastSignInAt)}` : ""} · ${s.openLeads} open lead${s.openLeads === 1 ? "" : "s"}`}
        actions={
          <>
            {s.roles.some((r) => r.key === "sales_executive") || !s.available ? (
              <AvailabilitySwitch action={toggleCrmStaffAvailableAction} userId={s.id} name={s.name} available={s.available} showLabel />
            ) : null}
            <ResetPasswordButton userId={s.id} />
            {s.disabled ? (
              <ActionButton action={toggleCrmStaffAction} hidden={{ userId: s.id, disable: "0" }}>
                Enable account
              </ActionButton>
            ) : (
              <ActionDialog
                action={toggleCrmStaffAction}
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
                telegramUsername: s.telegramUsername ? `@${s.telegramUsername}` : "",
                contactChannel: s.contactChannel,
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
        {c ? (
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Commission</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">Total earned</dt>
                  <dd className="text-2xl font-bold tabular-nums">{usd(c.commission.all)}</dd>
                  <dd className="text-muted-foreground text-xs">on {usd(c.deposits.all)} of verified deposits</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">This month</dt>
                  <dd className="text-2xl font-bold tabular-nums">{usd(c.commission.month)}</dd>
                  <dd className="text-muted-foreground text-xs">
                    on {usd(c.deposits.month)} · last month {usd(c.commission.lastMonth)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Waiting for verification</dt>
                  <dd className="text-2xl font-bold tabular-nums">{c.pending.count}</dd>
                  <dd className="text-muted-foreground text-xs">{usd(c.pending.minor)} in deposits</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Conversions</dt>
                  <dd className="text-2xl font-bold tabular-nums">{c.conversions.month}</dd>
                  <dd className="text-muted-foreground text-xs">this month · {c.conversions.all} all time</dd>
                </div>
              </dl>
              {c.recent.length ? (
                <ul className="divide-y">
                  {c.recent.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        <Link href={`/leads/${d.lead.id}`} className="text-edge-emerald font-semibold hover:underline">
                          {d.lead.name}
                        </Link>
                        <span className="text-muted-foreground">
                          {" "}
                          · {DEPOSIT_SEQUENCE_LABELS[d.sequence]} of {usd(d.amountMinor)} · {formatDate(d.depositedAt)}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        {d.commissionMinor != null ? <span className="font-semibold tabular-nums">{usd(d.commissionMinor)}</span> : null}
                        <DepositStatusBadge status={d.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">No deposits logged yet.</p>
              )}
              <Link href={`/deposits?staff=${s.id}`} className="text-edge-emerald w-fit font-semibold hover:underline">
                All their deposits
              </Link>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
