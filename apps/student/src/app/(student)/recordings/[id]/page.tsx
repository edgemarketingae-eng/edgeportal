import { classRoutes } from "@edge/contracts";
import { formatDate } from "@edge/domain/dates";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import Link from "next/link";
import { VideoPlayer } from "@/components/video-player";
import { load, requireStudent } from "@/lib/load";

export const metadata: Metadata = { title: "Recording" };

export default async function WatchPage(props: PageProps<"/recordings/[id]">) {
  const { id } = await props.params;
  await requireStudent();
  // 404 (unknown recording or no access) becomes notFound(); the API logs the view and signs a short-lived media URL.
  const { recording: rec, src, watermark } = await load(() => api(classRoutes.watch, { params: { id } }));

  return (
    <>
      <PageHeader title={rec.title} description={rec.recordedAt ? `Recorded ${formatDate(rec.recordedAt)}` : undefined} />
      <VideoPlayer src={src} watermark={watermark} />
      {rec.description ? <p className="mt-4 max-w-3xl text-sm whitespace-pre-line">{rec.description}</p> : null}
      {rec.cacheState !== "READY" ? <p className="text-muted-foreground mt-3 text-xs">First playback of a new recording can take a moment to start.</p> : null}
      <p className="text-muted-foreground mt-2 text-xs">Recordings are for your personal study only. Sharing or re-uploading them is not allowed.</p>
      <Link href="/recordings" className="text-edge-emerald mt-6 inline-block text-sm font-semibold hover:underline">
        All recordings
      </Link>
    </>
  );
}
