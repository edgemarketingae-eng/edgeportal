import { classRoutes } from "@edge/contracts";
import { daysUntil, formatDate, formatDateTime } from "@edge/domain/dates";
import { formatMoney } from "@edge/domain/money";
import { Badge } from "@edge/ui/components/badge";
import { Button } from "@edge/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@edge/ui/components/card";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import { CalendarClock, MessageCircle, Video } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PaymentProgress } from "@/components/payment-progress";
import { StatusBanner } from "@/components/status-banner";
import { getPortal, load, requireStudent } from "@/lib/load";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const v = await requireStudent();
  const portal = await getPortal();
  const { enrollment: e, entitlements: ent } = portal;
  const next = ent.active ? (await load(() => api(classRoutes.studentClasses))).upcoming[0] : undefined;
  const firstName = v.user.name.split(" ")[0];

  return (
    <>
      <PageHeader
        help="/docs/dashboard"
        title={`Welcome, ${firstName}`}
        description={e ? `${e.batch.courseTitle} · ${e.batch.name}` : undefined}
      />
      <StatusBanner portal={portal} />

      {e && ent.active && e.paymentState === "PARTIALLY_PAID" && e.balanceDueOn ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-50 p-4 text-sm">
          <p>
            Balance of <b>{formatMoney(e.remainingMinor, e.currency)}</b> is due by <b>{formatDate(e.balanceDueOn)}</b>
            {` (${Math.max(0, daysUntil(new Date(e.balanceDueOn), new Date(portal.now)))} days left).`} Access pauses automatically if it is
            not paid.
          </p>
          <Button asChild size="sm">
            <Link href="/checkout/balance">Pay balance</Link>
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {e ? (
          <Card>
            <CardHeader>
              <CardDescription>Your batch</CardDescription>
              <CardTitle className="text-lg">{e.batch.name}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <p>Starts {formatDate(e.batch.startDate)}</p>
              {e.batch.scheduleText ? <p className="text-muted-foreground">{e.batch.scheduleText}</p> : null}
              <Link href="/batch" className="text-edge-emerald mt-2 text-sm font-semibold hover:underline">
                Batch details
              </Link>
            </CardContent>
          </Card>
        ) : null}

        {e ? (
          <Card>
            <CardHeader>
              <CardDescription>Course fee</CardDescription>
              <CardTitle className="flex items-center gap-2 text-lg">
                {e.paymentState === "PAID" ? "Fully paid" : e.paymentState === "PARTIALLY_PAID" ? "Advance paid" : "Not paid yet"}
                {e.paymentState === "PAID" ? <Badge className="bg-edge-green text-edge-ink">Lifetime access</Badge> : null}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PaymentProgress paidMinor={e.paidCourseMinor} feeMinor={e.feeMinor} currency={e.currency} />
            </CardContent>
          </Card>
        ) : null}

        {ent.active ? (
          <Card>
            <CardHeader>
              <CardDescription className="flex items-center gap-1.5">
                <CalendarClock className="size-4" /> Next live class
              </CardDescription>
              <CardTitle className="text-lg">{next ? next.title : "Nothing scheduled yet"}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              {next ? (
                <>
                  <p>
                    {formatDateTime(next.startsAt)} <span className="text-muted-foreground">(Dubai)</span>
                  </p>
                  <Button asChild variant="outline" size="sm" className="w-fit">
                    <Link href="/classes">
                      <Video /> View classes
                    </Link>
                  </Button>
                </>
              ) : (
                <p className="text-muted-foreground">Your mentors will publish the schedule here.</p>
              )}
            </CardContent>
          </Card>
        ) : null}

        {ent.whatsappGroupUrl ? (
          <Card className="border-edge-emerald/30 bg-edge-ink text-edge-offwhite">
            <CardHeader>
              <CardDescription className="text-edge-mint/80">Community</CardDescription>
              <CardTitle className="text-lg">Your batch WhatsApp group</CardTitle>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <a href={ent.whatsappGroupUrl} target="_blank" rel="noreferrer">
                  <MessageCircle /> Join the group
                </a>
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
