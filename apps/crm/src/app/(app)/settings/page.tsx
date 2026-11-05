import { crmRoutes } from "@edge/contracts";
import { CopyButton } from "@edge/ui/blocks/copy-button";
import { tone } from "@edge/ui/lib/tones";
import { Badge } from "@edge/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@edge/ui/components/card";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import Link from "next/link";
import { CrmSettingsForm, FormOriginsForm } from "@/components/crm/crm-settings-form";
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
                Percent of each verified deposit: first deposits at a fixed rate, later deposits by the slab each person&apos;s monthly
                total of later deposits reaches. Products (Inner Circle, the clubs…) are managed under{" "}
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
            <CardTitle>Website forms</CardTitle>
            <CardDescription>
              Forms on the websites below can send leads straight from the visitor&apos;s browser, with no key. New leads land in{" "}
              <Link href={`/projects/${s.defaultProject.id}`} className="underline">
                {s.defaultProject.name}
              </Link>{" "}
              unless the form names a project code.{" "}
              <Link href="/docs/website-forms" className="underline">
                How to build the form
              </Link>
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-medium">POST</span>
              <code className="bg-muted rounded px-2 py-1 text-xs break-all">{s.publicFormUrl}</code>
              <CopyButton value={s.publicFormUrl} label="Copy form URL" />
            </p>
            <FormOriginsForm s={s} />
            {s.envFormOrigins.length ? (
              <div className="grid gap-1.5">
                <p className="text-muted-foreground">Also allowed by the server setup (PUBLIC_FORM_ORIGINS):</p>
                <ul className="flex flex-wrap gap-1.5">
                  {s.envFormOrigins.map((o) => (
                    <li key={o}>
                      <Badge variant="outline">{o}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Server-to-server webhook</CardTitle>
            <CardDescription>
              For a website&apos;s own server: it posts JSON to this endpoint, signed with <code>LEAD_WEBHOOK_SECRET</code> (never put the
              secret in a web page).{" "}
              <Link href="/docs/website-forms#server-to-server" className="underline">
                Payload and signature
              </Link>
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p className="flex flex-wrap items-center gap-2">
              <code className="bg-muted rounded px-2 py-1 text-xs break-all">{s.webhookUrl}</code>
              <CopyButton value={s.webhookUrl} label="Copy webhook URL" />
              <Badge variant="outline" className={s.webhookConfigured ? tone.success : tone.warning}>
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
