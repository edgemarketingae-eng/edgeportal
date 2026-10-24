import { classRoutes } from "@edge/contracts";
import { formatDate } from "@edge/domain/dates";
import { Card, CardContent } from "@edge/ui/components/card";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import { PlayCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StatusBanner } from "@/components/status-banner";
import { getPortal, load, requireStudent } from "@/lib/load";

export const metadata: Metadata = { title: "Recordings" };

function duration(sec: number | null) {
  if (!sec) return null;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m} min`;
}

export default async function RecordingsPage() {
  await requireStudent();
  const portal = await getPortal();
  if (!portal.entitlements.active) {
    return (
      <>
        <PageHeader help="/docs/recordings" title="Recordings" />
        <StatusBanner portal={portal} />
      </>
    );
  }
  const recordings = await load(() => api(classRoutes.studentRecordings));
  return (
    <>
      <PageHeader help="/docs/recordings" title="Recordings" description="Recorded classes of your batch." />
      {recordings.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center">Recordings appear here after each live class.</CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {recordings.map((r) => (
            <Link key={r.id} href={`/recordings/${r.id}`} className="group">
              <Card className="group-hover:border-edge-emerald h-full transition-colors">
                <CardContent className="flex gap-3 pt-6">
                  <PlayCircle className="text-edge-emerald size-9 shrink-0" />
                  <div>
                    <p className="font-semibold">{r.title}</p>
                    <p className="text-muted-foreground text-sm">
                      {[r.recordedAt ? formatDate(r.recordedAt) : null, duration(r.durationSec)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
