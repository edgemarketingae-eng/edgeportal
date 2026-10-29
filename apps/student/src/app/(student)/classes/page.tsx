import { classRoutes } from "@edge/contracts";
import { formatDateTime, formatTime } from "@edge/domain/dates";
import { Alert, AlertDescription } from "@edge/ui/components/alert";
import { Badge } from "@edge/ui/components/badge";
import { Button } from "@edge/ui/components/button";
import { Card, CardContent } from "@edge/ui/components/card";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import { Video } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StatusBanner } from "@/components/status-banner";
import { getPortal, load, requireStudent } from "@/lib/load";

export const metadata: Metadata = { title: "Live classes" };

const ERRORS: Record<string, (windowMinutes: number) => string> = {
  "not-open": (m) => `The join button opens ${m} minutes before the class starts.`,
  forbidden: () => "This class is not part of your access.",
  unavailable: () => "This class has no meeting link yet. Please check back shortly.",
};

export default async function ClassesPage(props: PageProps<"/classes">) {
  const sp = await props.searchParams;
  await requireStudent();
  const portal = await getPortal();
  if (!portal.entitlements.active) {
    return (
      <>
        <PageHeader help="/docs/classes" title="Live classes" />
        <StatusBanner portal={portal} />
      </>
    );
  }
  const { upcoming, past, joinWindowMinutes } = await load(() => api(classRoutes.studentClasses));
  const error = typeof sp.error === "string" ? ERRORS[sp.error]?.(joinWindowMinutes) : undefined;

  return (
    <>
      <PageHeader help="/docs/classes" title="Live classes" description="All times are Dubai time (GMT+4). Classes run on Google Meet." />
      {error ? (
        <Alert variant="warning" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <section className="grid gap-3">
        {upcoming.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground py-10 text-center">
              No upcoming classes yet. Your mentors will publish them here.
            </CardContent>
          </Card>
        ) : (
          upcoming.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{s.title}</p>
                    {!s.isOwnBatch ? <Badge variant="outline">{s.batchName}</Badge> : null}
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {formatDateTime(s.startsAt)} – {formatTime(s.endsAt)} · {s.hostName}
                  </p>
                  {s.description ? <p className="mt-1 text-sm">{s.description}</p> : null}
                </div>
                {s.joinable ? (
                  <Button asChild size="lg">
                    {/* The API checks access and the time window, logs the join, then redirects to Meet. */}
                    <a href={`/api/join/${s.id}`} target="_blank" rel="noreferrer">
                      <Video /> Join now
                    </a>
                  </Button>
                ) : (
                  <Button variant="outline" disabled>
                    Opens {joinWindowMinutes} min before
                  </Button>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </section>
      {past.length ? (
        <section className="mt-10">
          <h2 className="mb-3 font-semibold">Recent classes</h2>
          <ul className="bg-card divide-y rounded-xl border">
            {past.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>
                  <span className="font-medium">{s.title}</span>
                  <span className="text-muted-foreground block">{formatDateTime(s.startsAt)}</span>
                </span>
                {s.recordingIds[0] ? (
                  <Link className="text-edge-emerald font-semibold hover:underline" href={`/recordings/${s.recordingIds[0]}`}>
                    Watch recording
                  </Link>
                ) : s.status === "CANCELLED" ? (
                  <Badge variant="outline">Cancelled</Badge>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
