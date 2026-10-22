import { formatDate } from "@edge/domain/dates";
import { formatMoney } from "@edge/domain/money";
import { Button } from "@edge/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@edge/ui/components/card";
import { PageHeader } from "@edge/ui/shell/app-shell";
import type { Metadata } from "next";
import Link from "next/link";
import { StatusBanner } from "@/components/status-banner";
import { getPortal, requireStudent } from "@/lib/load";

export const metadata: Metadata = { title: "My batch" };

export default async function BatchPage() {
  await requireStudent();
  const portal = await getPortal();
  const e = portal.enrollment;
  if (!e) {
    return (
      <>
        <PageHeader title="My batch" />
        <StatusBanner portal={portal} />
      </>
    );
  }
  const mentors = [...e.batch.mentors].sort((a, b) => Number(b.isLead) - Number(a.isLead));
  const presets = e.batch.advancePresetsMinor.filter((p) => p < e.feeMinor).sort((a, b) => a - b);

  return (
    <>
      <PageHeader title={e.batch.name} description={e.batch.courseTitle} />
      <StatusBanner portal={portal} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>About this program</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            <p className="leading-relaxed whitespace-pre-line">{e.batch.description ?? e.batch.courseDescription ?? "Details will be shared soon."}</p>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Starts</dt>
                <dd className="font-semibold">{formatDate(e.batch.startDate)}</dd>
              </div>
              {e.batch.endDate ? (
                <div>
                  <dt className="text-muted-foreground">Ends</dt>
                  <dd className="font-semibold">{formatDate(e.batch.endDate)}</dd>
                </div>
              ) : null}
              {e.batch.scheduleText ? (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">Schedule</dt>
                  <dd className="font-semibold">{e.batch.scheduleText}</dd>
                </div>
              ) : null}
            </dl>
            {mentors.length ? (
              <div>
                <p className="text-muted-foreground mb-2">Mentors</p>
                <ul className="flex flex-wrap gap-2">
                  {mentors.map((m, i) => (
                    <li key={`${m.name}-${i}`} className="bg-muted rounded-full px-3 py-1 font-medium">
                      {m.name}
                      {m.title ? <span className="text-muted-foreground"> · {m.title}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Fees</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <p>
              Course fee: <b>{formatMoney(e.feeMinor, e.currency)}</b>
              <span className="text-muted-foreground block text-xs">5% VAT applies for UAE students. A payment processing fee is added at checkout depending on the method.</span>
            </p>
            {e.batch.advanceEnabled && presets.length ? (
              <p>
                Reserve your seat with an advance from <b>{formatMoney(presets[0]!, e.currency)}</b>, and pay the rest before the balance due date.
              </p>
            ) : null}
            {portal.entitlements.canCheckout ? (
              <Button asChild size="lg">
                <Link href="/checkout">Choose a payment plan</Link>
              </Button>
            ) : portal.entitlements.canPayBalance ? (
              <Button asChild size="lg">
                <Link href="/checkout/balance">Pay balance {formatMoney(e.remainingMinor, e.currency)}</Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
