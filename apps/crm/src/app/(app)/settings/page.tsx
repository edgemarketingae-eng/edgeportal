import { crmRoutes } from "@edge/contracts";
import { Badge } from "@edge/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@edge/ui/components/card";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import Link from "next/link";
import { CrmSettingsForm } from "@/components/crm/crm-settings-form";
import { CommissionSettingsForm } from "@/components/crm/deposit-actions";
import { can, load, requireCrm } from "@/lib/load";

export const metadata: Metadata = { title: "Settings" };

export default async function CrmSettingsPage() {
  const v = await requireCrm("crm.manage");
  const [s, commission] = await Promise.all([
    load(() => api(crmRoutes.settings)),
    can(v, "crm.commission.manage") ? load(() => api(crmRoutes.commissionSettings)) : null,
  ]);
  return (
    <>
      <PageHeader help="/docs/settings" title="Settings" />
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Pipeline rules</CardTitle>
          </CardHeader>
          <CardContent>
            <CrmSettingsForm s={s} />
          </CardContent>
        </Card>
        {commission ? (
          <Card>
            <CardHeader>
              <CardTitle>Commission on JetaFX deposits</CardTitle>
              <CardDescription>
                Percent of each verified deposit: first deposits at a fixed rate, later deposits by the slab their amount falls in. Products
                (Inner Circle, the clubs…) are managed under{" "}
                <Link href="/products" className="underline">
                  Products
                </Link>
                .
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CommissionSettingsForm s={commission} />
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Website lead form</CardTitle>
            <CardDescription>
              The academy website posts new enquiries to this endpoint, server to server, signed with <code>LEAD_WEBHOOK_SECRET</code>{" "}
              (docs/CRM.md has the payload and the HMAC header). New enquiries land in{" "}
              <Link href={`/projects/${s.defaultProject.id}`} className="underline">
                {s.defaultProject.name}
              </Link>
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p className="flex flex-wrap items-center gap-2">
              <code className="bg-muted rounded px-2 py-1 text-xs">{s.webhookUrl}</code>
              <Badge
                variant="outline"
                className={
                  s.webhookConfigured
                    ? "border-edge-green/40 bg-edge-green/20 text-edge-emerald"
                    : "border-amber-300 bg-amber-50 text-amber-800"
                }
              >
                {s.webhookConfigured ? "secret configured" : "disabled: set LEAD_WEBHOOK_SECRET"}
              </Badge>
            </p>
            <p className="text-muted-foreground">
              Enquiries from people who already have a lead are added to that lead&apos;s timeline instead of creating a duplicate.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
