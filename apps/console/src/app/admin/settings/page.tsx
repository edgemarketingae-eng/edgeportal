import { settingsRoutes } from "@edge/contracts";
import { Badge } from "@edge/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@edge/ui/components/card";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { toDubaiLocal } from "@edge/domain/dates";
import { FeeRateForm, FreeClassForm, GeneralSettingsForm, OdooMappingForm } from "@/components/settings/settings-forms";
import { can, load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Settings" };

const amt = (m: number | null) => (m == null ? "" : (m / 100).toFixed(2));
/** Stored rate ("0.029") to the percent the form edits ("2.9"), without float noise. */
const percent = (rate: string) => String(Number((Number(rate) * 100).toFixed(4)));

export default async function SettingsPage() {
  const v = await requireStaff("admin.access");
  const fees = can(v, "settings.fees");
  const integrations = can(v, "settings.integrations");
  if (!fees && !integrations) redirect("/admin?error=forbidden");
  const s = await load(() => api(settingsRoutes.get));

  return (
    <>
      <PageHeader help="/admin/docs/settings" title="Settings" />
      <div className="grid gap-6">
        {fees ? (
          <Card>
            <CardHeader>
              <CardTitle>Payment methods and fees</CardTitle>
              <CardDescription>
                The student pays the course fee, VAT where it applies, and a processing fee grossed up so the academy receives the full
                amount. Rates must match each provider&apos;s contract. Countries empty = all.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {s.feeRates.map((r) => (
                <FeeRateForm
                  key={r.key}
                  r={{
                    key: r.key,
                    gateway: r.gateway,
                    label: r.label,
                    pctPercent: percent(r.pct),
                    fixed: amt(r.fixedMinor),
                    enabled: r.enabled,
                    min: amt(r.minTotalMinor),
                    max: amt(r.maxTotalMinor),
                    countries: r.countries.join(", "),
                    excludeCountries: r.excludeCountries.join(", "),
                  }}
                />
              ))}
            </CardContent>
          </Card>
        ) : null}
        {fees ? (
          <Card>
            <CardHeader>
              <CardTitle>General</CardTitle>
            </CardHeader>
            <CardContent>
              <GeneralSettingsForm
                v={{
                  vatCountries: s.vatCountries.join(", "),
                  vatRate: percent(s.vatCourseRate),
                  reminderOffsets: s.reminderOffsets.join(", "),
                  joinWindowMinutes: String(s.joinWindowMinutes),
                  checkoutExpiryMinutes: String(s.checkoutExpiryMinutes),
                  ...s.academy,
                }}
              />
            </CardContent>
          </Card>
        ) : null}
        {fees ? (
          <Card>
            <CardHeader>
              <CardTitle>Free live class (landing page)</CardTitle>
              <CardDescription>
                The next free class shown on the student app&apos;s home page. Visitors who join are added to the CRM General project,
                assigned to a sales executive who has a phone number, and sent to that person&apos;s WhatsApp.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FreeClassForm
                v={{
                  enabled: s.freeClass.enabled,
                  title: s.freeClass.title,
                  startsAt: s.freeClass.startsAt ? toDubaiLocal(s.freeClass.startsAt) : "",
                  durationMinutes: String(s.freeClass.durationMinutes),
                  platform: s.freeClass.platform,
                }}
              />
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Odoo invoicing</CardTitle>
            <CardDescription>
              IDs from edge-verse.odoo.com used for every invoice. Ask your accountant to confirm products, taxes and one clearing journal
              per payment provider.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OdooMappingForm
              disabled={!integrations}
              v={{
                courseProductId: s.odoo.courseProductId?.toString() ?? "",
                feeProductId: s.odoo.feeProductId?.toString() ?? "",
                taxStandardId: s.odoo.taxStandardId?.toString() ?? "",
                taxZeroRatedId: s.odoo.taxZeroRatedId?.toString() ?? "",
                journals: Object.fromEntries(Object.entries(s.odoo.journalIds).map(([k, n]) => [k, String(n)])),
              }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Integrations</CardTitle>
            <CardDescription>
              Credentials live in the server environment, not in the database. Mock mode never contacts the provider.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              {Object.entries(s.modes).map(([label, mode]) => (
                <li key={label} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  {label}
                  <Badge
                    variant="outline"
                    className={
                      mode === "live" || mode === "mailersend"
                        ? "border-edge-green/40 bg-edge-green/20 text-edge-emerald"
                        : "border-amber-300 bg-amber-50 text-amber-800"
                    }
                  >
                    {mode}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
