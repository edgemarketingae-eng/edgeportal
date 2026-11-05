import { rm } from "node:fs/promises";
import { ClassSession, JoinLog, MeetEvent, Recording, RecordingView, type ClassSessionDoc, type RecordingDoc } from "@edge/db";
import { now } from "@edge/domain/clock";
import { formatDate, formatDateTime } from "@edge/domain/dates";
import { NotFoundError } from "../errors";
import { oid } from "../ids";
import { auditDelete, deleter, gather, Plan, plural, snapshot } from "../records/kit";
import { cachePathFor } from "../recordings/cache";

/** Meet recordings are looked for until this long after a class ends (discoverMeetRecordings). */
const DISCOVERY_MS = 48 * 3600_000;

/** A past or cancelled class. A scheduled one is cancelled first, which removes the calendar event and can tell students. */
export const classDeleter = deleter<ClassSessionDoc>({
  load: async (id) => {
    const c = await ClassSession.findById(oid(id, "Class")).lean();
    if (!c) throw new NotFoundError("Class");
    return c as ClassSessionDoc;
  },
  plan: async (c) => {
    const p = new Plan(`the class ${c.title} (${formatDateTime(c.startsAt)})`);
    if (c.status === "SCHEDULED" && c.endsAt > now())
      p.block("It's still scheduled. Cancel it first: that removes the calendar invite and can tell students");
    const [joins, recordings] = await gather([
      () => JoinLog.countDocuments({ classSessionId: c._id }),
      () => Recording.countDocuments({ classSessionId: c._id }),
    ] as const);
    p.remove(joins, "join record");
    if (recordings) p.warn(`${plural(recordings, "recording stays", "recordings stay")} in the batch, no longer tied to this class.`);
    if (c.status !== "CANCELLED" && c.meetEventId && now().getTime() - c.endsAt.getTime() < DISCOVERY_MS)
      p.warn("Recordings of this class that haven't arrived yet won't be picked up.");
    return p;
  },
  apply: async (c, actor) => {
    await JoinLog.deleteMany({ classSessionId: c._id });
    await Recording.updateMany({ classSessionId: c._id }, { $set: { classSessionId: null } });
    if (c.meetEventId) await MeetEvent.deleteOne({ _id: c.meetEventId });
    await ClassSession.deleteOne({ _id: c._id });
    await auditDelete({ actor, action: "class.delete", entityType: "ClassSession", entityId: String(c._id), before: snapshot(c) });
  },
  done: (c) => `${c.title} deleted.`,
});

/** A recording and its view history. The video itself stays in Google Drive. */
export const recordingDeleter = deleter<RecordingDoc>({
  load: async (id) => {
    const r = await Recording.findById(oid(id, "Recording")).lean();
    if (!r) throw new NotFoundError("Recording");
    return r as RecordingDoc;
  },
  plan: async (r) => {
    const p = new Plan(`the recording ${r.title}`);
    if (r.source === "MEET_AUTO" && r.classSessionId) {
      const c = await ClassSession.findById(r.classSessionId, { endsAt: 1, status: 1 }).lean();
      if (c && c.status !== "CANCELLED" && now().getTime() - c.endsAt.getTime() < DISCOVERY_MS)
        p.block(
          `Meet recordings are fetched again for 48 hours after the class. Hide it now and delete it after ${formatDate(new Date(c.endsAt.getTime() + DISCOVERY_MS))}`,
        );
    }
    p.remove(await RecordingView.countDocuments({ recordingId: r._id }), "view record");
    p.warn("The video file stays in Google Drive.");
    return p;
  },
  apply: async (r, actor) => {
    await RecordingView.deleteMany({ recordingId: r._id });
    await Recording.deleteOne({ _id: r._id });
    await auditDelete({ actor, action: "recording.delete", entityType: "Recording", entityId: String(r._id), before: snapshot(r) });
  },
  after: async (r) => {
    await rm(r.cache?.path ?? cachePathFor(String(r._id)), { force: true });
  },
  done: (r) => `${r.title} deleted.`,
});
