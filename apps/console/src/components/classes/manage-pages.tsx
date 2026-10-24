import { classRoutes, type ClassSessionDto } from "@edge/contracts";
import { dubaiParts } from "@edge/domain/classes/window";
import { formatDate, formatDateTime } from "@edge/domain/dates";
import { Pagination } from "@edge/ui/blocks/pagination";
import { Badge } from "@edge/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@edge/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@edge/ui/components/table";
import { api } from "@edge/web/server";
import { load } from "@/lib/load";
import { ClassRowActions, RecordingStatusButton, type ClassRow } from "./class-row-actions";
import { AddRecordingForm, ScheduleClassForm } from "./forms";

function editable(s: ClassSessionDto): ClassRow {
  const starts = new Date(s.startsAt);
  const p = dubaiParts(starts);
  return {
    id: s.id,
    title: s.title,
    description: s.description ?? "",
    date: p.date,
    time: p.time,
    durationMin: Math.round((new Date(s.endsAt).getTime() - starts.getTime()) / 60_000),
    manualJoinUrl: s.manualJoinUrl ?? "",
    upcoming: true,
  };
}

/** Class management for the viewer's batches (the API scopes them: a mentor's own, or all for admins). */
/** `page`: page of the past-and-cancelled list. */
export async function ClassesManager({ page = 1 }: { page?: number }) {
  const { batches, hosts, defaultHostId, upcoming, past } = await load(() =>
    api(classRoutes.manageClasses, { query: { page, pageSize: 25 } }),
  );
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Schedule a live class</CardTitle>
        </CardHeader>
        <CardContent>
          {batches.length ? (
            <ScheduleClassForm batches={batches} hosts={hosts} defaultHostId={defaultHostId ?? undefined} />
          ) : (
            <p className="text-muted-foreground text-sm">You are not assigned to any batch yet.</p>
          )}
        </CardContent>
      </Card>
      <Card className="p-0">
        <CardHeader className="px-6 pt-6">
          <CardTitle>Upcoming</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Class</TableHead>
              <TableHead>When (Dubai)</TableHead>
              <TableHead className="hidden md:table-cell">Host</TableHead>
              <TableHead>Meet</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {upcoming.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground py-6 text-center">
                  Nothing scheduled.
                </TableCell>
              </TableRow>
            ) : (
              upcoming.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <span className="font-semibold">{s.title}</span>
                    <div className="text-muted-foreground text-xs">{s.batchName}</div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatDateTime(s.startsAt)}</TableCell>
                  <TableCell className="hidden md:table-cell">{s.hostName}</TableCell>
                  <TableCell>
                    {s.manualJoinUrl ? (
                      <Badge variant="outline">Manual link</Badge>
                    ) : s.meet.hasLink ? (
                      <Badge variant="outline" className="text-edge-emerald">
                        {s.meet.autoRecord ? "Meet · auto-record" : "Meet"}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-destructive">
                        No link
                      </Badge>
                    )}
                    {s.meet.lastError ? (
                      <div className="text-destructive mt-1 max-w-56 truncate text-[11px]" title={s.meet.lastError}>
                        {s.meet.lastError}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <ClassRowActions c={editable(s)} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
      <Card className="p-0">
        <CardHeader className="px-6 pt-6">
          <CardTitle>Past and cancelled</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Class</TableHead>
              <TableHead>When</TableHead>
              <TableHead className="text-right">Joins</TableHead>
              <TableHead>Recording</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {past.rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <span className="font-medium">{s.title}</span> <span className="text-muted-foreground text-xs">· {s.batchName}</span>
                  {s.status === "CANCELLED" ? (
                    <Badge variant="outline" className="ml-2">
                      Cancelled
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="whitespace-nowrap">{formatDateTime(s.startsAt)}</TableCell>
                <TableCell className="text-right tabular-nums">{s.joins}</TableCell>
                <TableCell>
                  {s.recordings.length ? (
                    `${s.recordings.length} (${s.recordings.map((r) => r.status.toLowerCase()).join(", ")})`
                  ) : (
                    <span className="text-muted-foreground">none yet</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <Pagination page={past.page} pageSize={past.pageSize} total={past.total} noun="past classes" defaultSize={25} className="-mt-2" />
    </div>
  );
}

export async function RecordingsManager({ page = 1 }: { page?: number }) {
  const { batches, sessions, recordings: paged } = await load(() => api(classRoutes.manageRecordings, { query: { page, pageSize: 25 } }));
  const recordings = paged.rows;
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Add a recording from Google Drive</CardTitle>
        </CardHeader>
        <CardContent>
          {batches.length ? (
            <AddRecordingForm batches={batches} sessions={sessions} />
          ) : (
            <p className="text-muted-foreground text-sm">No batches available.</p>
          )}
          <p className="text-muted-foreground mt-3 text-xs">
            Recordings of classes scheduled here are found automatically about 15 minutes after the recording is ready in Drive.
          </p>
        </CardContent>
      </Card>
      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Recording</TableHead>
              <TableHead className="hidden md:table-cell">Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Streaming</TableHead>
              <TableHead className="text-right">Views</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {recordings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-6 text-center">
                  No recordings yet.
                </TableCell>
              </TableRow>
            ) : (
              recordings.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <span className="font-semibold">{r.title}</span>
                    <div className="text-muted-foreground text-xs">
                      {r.batchName}
                      {r.recordedAt ? ` · ${formatDate(r.recordedAt)}` : ""}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{r.source === "MEET_AUTO" ? "Meet (auto)" : "Drive link"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={r.status === "PUBLISHED" ? "text-edge-emerald" : ""}>
                      {r.status.toLowerCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-xs md:table-cell" title={r.lastError ?? undefined}>
                    {r.cacheState === "READY" ? (
                      "cached"
                    ) : r.cacheState === "ERROR" ? (
                      <span className="text-destructive">error</span>
                    ) : (
                      r.cacheState.toLowerCase()
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.views}</TableCell>
                  <TableCell>
                    <RecordingStatusButton id={r.id} status={r.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
      <Pagination page={paged.page} pageSize={paged.pageSize} total={paged.total} noun="recordings" defaultSize={25} className="-mt-2" />
    </div>
  );
}
