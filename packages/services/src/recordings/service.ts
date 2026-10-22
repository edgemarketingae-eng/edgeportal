import { AuthUser, Batch, ClassSession, MeetEvent, Recording, RecordingView, Types, isDuplicateKey, type RecordingDoc } from "@edge/db";
import type { RecordingDto } from "@edge/contracts";
import { now } from "@edge/domain/clock";
import { formatDate } from "@edge/domain/dates";
import { canWatchRecording, type Entitlements } from "@edge/domain/enrollment/entitlements";
import type { Actor } from "@edge/domain/enums";
import { maskPhone } from "@edge/domain/phone";
import { parseDriveFileId } from "@edge/integrations/google/workspace";
import { audit } from "../audit";
import { assertCanSchedule, batchScopeFor } from "../classes/service";
import { env } from "../env";
import { BusinessError, ForbiddenError, NotFoundError } from "../errors";
import { oid } from "../ids";
import { iso } from "../mappers";
import { runtime } from "../runtime";
import { requestCacheFill } from "./cache";
import { signMediaToken } from "./token";

export class RecordingError extends BusinessError {}

async function assertCanManage(actorId: string, batchId: Types.ObjectId | string) {
  if ((await batchScopeFor(actorId, "recordings")) === "all") return;
  try {
    await assertCanSchedule(actorId, batchId);
  } catch (e) {
    if (e instanceof ForbiddenError) throw new ForbiddenError("You can only manage recordings of batches you mentor.");
    throw e;
  }
}

/** Staff pastes a Drive link (the file must be readable by the impersonated Workspace account). */
export async function addRecordingFromDrive(
  input: { batchId: string; classSessionId?: string | null; driveUrl: string; title: string; description?: string; publish: boolean; accessEmail?: string | null },
  actor: Actor & { type: "USER" },
) {
  await assertCanManage(actor.id, input.batchId);
  const fileId = parseDriveFileId(input.driveUrl);
  if (!fileId) throw new RecordingError("Paste a Google Drive file link (…/file/d/<id>/view)");
  if (await Recording.exists({ driveFileId: fileId })) throw new RecordingError("This Drive file is already added");

  const session = input.classSessionId ? await ClassSession.findOne({ _id: oid(input.classSessionId, "Class"), batchId: oid(input.batchId) }).lean() : null;
  if (input.classSessionId && !session) throw new RecordingError("That class is not part of the chosen batch");
  let accessEmail = input.accessEmail ?? null;
  if (!accessEmail && session?.meetEventId) accessEmail = (await MeetEvent.findById(session.meetEventId, { organizerEmail: 1 }).lean())?.organizerEmail ?? null;
  accessEmail ??= env.GOOGLE_DEFAULT_ORGANIZER ?? null;

  let meta;
  try {
    meta = await runtime().google.getDriveFile(accessEmail ?? "", fileId);
  } catch (e) {
    throw new RecordingError(`Could not read that file from Drive. Share it with ${accessEmail ?? "the academy host account"} and try again. (${String(e).slice(0, 160)})`);
  }
  if (!meta.mimeType.startsWith("video/")) throw new RecordingError(`That file is ${meta.mimeType}, not a video`);

  let rec;
  try {
    rec = await new Recording({
      batchId: oid(input.batchId),
      classSessionId: session?._id ?? null,
      title: input.title,
      description: input.description || null,
      source: "MANUAL_DRIVE",
      status: input.publish ? "PUBLISHED" : "DISCOVERED",
      publishedAt: input.publish ? now() : null,
      driveFileId: fileId,
      driveAccessEmail: accessEmail,
      mimeType: meta.mimeType,
      sizeBytes: meta.sizeBytes ?? null,
      durationSec: meta.durationSec ?? null,
      recordedAt: session?.startsAt ?? now(),
    }).save();
  } catch (e) {
    if (isDuplicateKey(e)) throw new RecordingError("This Drive file is already added");
    throw e;
  }
  await audit({ actor, action: "recording.add", entityType: "Recording", entityId: String(rec._id), after: { fileId, batchId: input.batchId } });
  await requestCacheFill(String(rec._id));
  return { id: String(rec._id) };
}

export async function setRecordingStatus(id: string, status: "PUBLISHED" | "HIDDEN", actor: Actor & { type: "USER" }) {
  const r = await Recording.findById(oid(id, "Recording")).lean();
  if (!r) throw new NotFoundError("Recording");
  await assertCanManage(actor.id, r.batchId);
  await Recording.updateOne({ _id: r._id }, { $set: { status, publishedAt: status === "PUBLISHED" ? (r.publishedAt ?? now()) : (r.publishedAt ?? null) } });
  await audit({ actor, action: `recording.${status.toLowerCase()}`, entityType: "Recording", entityId: id });
  if (status === "PUBLISHED") await requestCacheFill(id);
}

/** Job: find Meet recordings for classes that ended in the last 48 hours. */
export async function discoverMeetRecordings() {
  const t = now();
  const sessions = await ClassSession.find({ status: { $ne: "CANCELLED" }, endsAt: { $lt: t, $gt: new Date(t.getTime() - 48 * 3600_000) }, meetEventId: { $ne: null } }).lean();
  const [meets, batches] = await Promise.all([
    MeetEvent.find({ _id: { $in: sessions.map((s) => s.meetEventId) }, meetSpaceName: { $ne: null } }).lean(),
    Batch.find({ _id: { $in: sessions.map((s) => s.batchId) } }, { autoPublishRecordings: 1 }).lean(),
  ]);
  const meetById = new Map(meets.map((m) => [String(m._id), m]));
  const autoPublish = new Map(batches.map((b) => [String(b._id), b.autoPublishRecordings ?? true]));
  let created = 0;
  let scanned = 0;
  for (const s of sessions) {
    const me = meetById.get(String(s.meetEventId));
    if (!me?.meetSpaceName) continue;
    scanned++;
    let recs;
    try {
      recs = await runtime().google.listRecordings(me.organizerEmail, me.meetSpaceName);
    } catch (e) {
      await MeetEvent.updateOne({ _id: me._id }, { $set: { lastError: `recordings: ${String(e).slice(0, 300)}` } });
      continue;
    }
    const files = recs.filter((x) => x.state === "FILE_GENERATED" && x.driveFileId);
    for (const [i, r] of files.entries()) {
      if (await Recording.exists({ $or: [{ meetRecordingName: r.name }, { driveFileId: r.driveFileId }] })) continue;
      const publish = autoPublish.get(String(s.batchId)) ?? true;
      try {
        const rec = await new Recording({
          batchId: s.batchId,
          classSessionId: s._id,
          title: files.length > 1 ? `${s.title} (part ${i + 1})` : s.title,
          source: "MEET_AUTO",
          status: publish ? "PUBLISHED" : "DISCOVERED",
          publishedAt: publish ? t : null,
          driveFileId: r.driveFileId,
          driveAccessEmail: me.organizerEmail,
          meetRecordingName: r.name,
          recordedAt: r.startTime ? new Date(r.startTime) : s.startsAt,
          durationSec: r.startTime && r.endTime ? Math.round((Date.parse(r.endTime) - Date.parse(r.startTime)) / 1000) : null,
        }).save();
        created++;
        await requestCacheFill(String(rec._id));
      } catch (e) {
        if (!isDuplicateKey(e)) throw e; // a concurrent discovery run inserted it first
      }
    }
    if (s.status === "SCHEDULED") await ClassSession.updateOne({ _id: s._id, status: "SCHEDULED" }, { $set: { status: "COMPLETED" } });
  }
  return { sessions: scanned, created };
}

export async function toRecordingDtos(recs: RecordingDoc[], withViews = false): Promise<RecordingDto[]> {
  const [batches, views] = await Promise.all([
    Batch.find({ _id: { $in: recs.map((r) => r.batchId) } }, { name: 1 }).lean(),
    withViews
      ? RecordingView.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { recordingId: { $in: recs.map((r) => r._id) } } }, { $group: { _id: "$recordingId", n: { $sum: 1 } } }])
      : Promise.resolve([]),
  ]);
  const bn = new Map(batches.map((b) => [String(b._id), b.name]));
  const vn = new Map(views.map((v) => [String(v._id), v.n]));
  return recs.map((r) => ({
    id: String(r._id),
    batchId: String(r.batchId),
    batchName: bn.get(String(r.batchId)) ?? "",
    classSessionId: r.classSessionId ? String(r.classSessionId) : null,
    title: r.title,
    description: r.description ?? null,
    source: r.source,
    status: r.status,
    recordedAt: iso(r.recordedAt ?? null),
    durationSec: r.durationSec ?? null,
    cacheState: r.cache?.state ?? "NONE",
    lastError: withViews ? (r.lastError ?? null) : null,
    views: vn.get(String(r._id)) ?? 0,
  }));
}

export async function listStudentRecordings(ent: Entitlements) {
  if (!ent.recordingsBatchId) return [];
  const recs = await Recording.find({ batchId: oid(ent.recordingsBatchId), status: "PUBLISHED" }).sort({ sortOrder: 1, recordedAt: -1 }).lean();
  return toRecordingDtos(recs);
}

/** Student watch page data: entitlement-checked, view logged, short-lived signed media URL. */
export async function getWatch(recordingId: string, userId: string, ent: Entitlements, meta: { ip: string | null; userAgent: string | null }) {
  const r = await Recording.findById(oid(recordingId, "Recording")).lean();
  if (!r || !canWatchRecording(ent, { batchId: String(r.batchId), status: r.status })) throw new NotFoundError("Recording");
  const user = await AuthUser.findById(oid(userId), { name: 1, email: 1, phoneNumber: 1 }).lean();
  await RecordingView.create({ recordingId: r._id, userId: oid(userId), ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300) ?? null });
  const [recording] = await toRecordingDtos([r]);
  return {
    recording: recording!,
    src: `${env.API_PUBLIC_URL}/api/media/recordings/${recordingId}?t=${signMediaToken(recordingId, userId)}`,
    watermark: `${user?.name ?? ""} · ${user?.phoneNumber ? maskPhone(user.phoneNumber) : (user?.email ?? "")}`,
  };
}

export async function getManageRecordings(userId: string) {
  const scope = await batchScopeFor(userId, "recordings");
  const inScope = (field: string) => (scope === "all" ? {} : { [field]: { $in: scope } });
  const [batches, sessions, recs] = await Promise.all([
    Batch.find({ ...inScope("_id"), status: { $ne: "ARCHIVED" } }, { name: 1 }).sort({ startDate: -1 }).lean(),
    ClassSession.find({ ...inScope("batchId"), startsAt: { $lt: now() }, status: { $ne: "CANCELLED" } }).sort({ startsAt: -1 }).limit(40).lean(),
    Recording.find(inScope("batchId")).sort({ createdAt: -1 }).limit(100).lean(),
  ]);
  const bn = new Map(batches.map((b) => [String(b._id), b.name]));
  return {
    batches: batches.map((b) => ({ id: String(b._id), name: b.name })),
    sessions: sessions.map((s) => ({ id: String(s._id), batchId: String(s.batchId), label: `${formatDate(s.startsAt)} · ${s.title} (${bn.get(String(s.batchId)) ?? ""})` })),
    recordings: await toRecordingDtos(recs, true),
  };
}

/** Media route lookup: token-bound user must still be entitled (staff may preview any recording in scope). */
export async function recordingForStream(recordingId: string) {
  if (!Types.ObjectId.isValid(recordingId)) return null;
  const r = await Recording.findById(recordingId).lean();
  if (!r || r.status === "HIDDEN" || r.status === "ERROR") return null;
  return r;
}
