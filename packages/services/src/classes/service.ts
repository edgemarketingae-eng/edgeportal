import {
  AuthUser,
  Batch,
  ClassSession,
  Enrollment,
  JoinLog,
  MeetEvent,
  Recording,
  StaffProfile,
  Types,
  type ClassSessionDoc,
} from "@edge/db";
import type { ClassSessionDto } from "@edge/contracts";
import { now } from "@edge/domain/clock";
import { dubaiInstant, joinWindowOpen } from "@edge/domain/classes/window";
import { canAccessLiveSession, type Entitlements } from "@edge/domain/enrollment/entitlements";
import type { Actor } from "@edge/domain/enums";
import { audit } from "../audit";
import { can, permissionsFor } from "../auth/viewer";
import { env } from "../env";
import { BusinessError, ForbiddenError, NotFoundError } from "../errors";
import { oid } from "../ids";
import { iso } from "../mappers";
import { findPage, type PageInput } from "../paging";
import { queueEmail } from "../notifications/email";
import { flushOutbox, runtime } from "../runtime";
import { getSetting } from "../settings";
import { listMentors } from "../catalog/service";

export class ClassError extends BusinessError {}

/**
 * Batches this staff member manages: all (class.schedule.any, or recording.manage for recordings)
 * or only the ones they mentor.
 */
export async function batchScopeFor(userId: string, area: "classes" | "recordings" = "classes"): Promise<Types.ObjectId[] | "all"> {
  const staff = await StaffProfile.findById(oid(userId)).lean();
  const perms = await permissionsFor(staff?.roleIds ?? []);
  if (can(perms, "class.schedule.any") || (area === "recordings" && can(perms, "recording.manage"))) return "all";
  return (await Batch.find({ "mentors.userId": oid(userId) }, { _id: 1 }).lean()).map((b) => b._id);
}

export async function assertCanSchedule(actorId: string, batchId: Types.ObjectId | string) {
  const staff = await StaffProfile.findById(oid(actorId)).lean();
  const perms = await permissionsFor(staff?.roleIds ?? []);
  if (can(perms, "class.schedule.any")) return;
  if (can(perms, "class.schedule.own") && (await Batch.exists({ _id: oid(String(batchId), "Batch"), "mentors.userId": oid(actorId) })))
    return;
  throw new ForbiddenError("You can only manage classes for batches you mentor.");
}

async function organizerFor(hostId: Types.ObjectId) {
  const staff = await StaffProfile.findById(hostId).lean();
  const email = staff?.workspaceEmail ?? env.GOOGLE_DEFAULT_ORGANIZER;
  if (!email) throw new ClassError("The host has no Google Workspace email. Add it on their staff profile, or paste a Meet link.");
  return email;
}

async function notifyBatch(
  batchId: Types.ObjectId,
  template: "class.scheduled" | "class.cancelled",
  session: { id: string; title: string; startsAt: Date; cancelReason?: string | null },
) {
  const enrollments = await Enrollment.find({ batchId, status: "ACTIVE", isCurrent: true }, { studentId: 1 }).lean();
  const [users, batch] = await Promise.all([
    AuthUser.find({ _id: { $in: enrollments.map((e) => e.studentId) } }, { name: 1, email: 1 }).lean(),
    Batch.findById(batchId, { name: 1 }).lean(),
  ]);
  for (const u of users) {
    const base = { name: u.name, title: session.title, startsAt: session.startsAt.toISOString() };
    if (template === "class.scheduled") {
      await queueEmail({
        to: u.email,
        userId: String(u._id),
        template,
        data: { ...base, batchName: batch?.name ?? "", classesUrl: `${env.STUDENT_APP_URL}/classes` },
        dedupeKey: `class:${session.id}:${u._id}:${session.startsAt.toISOString()}`,
      });
    } else {
      await queueEmail({
        to: u.email,
        userId: String(u._id),
        template,
        data: { ...base, reason: session.cancelReason ?? null },
        dedupeKey: `class-cancel:${session.id}:${u._id}`,
      });
    }
  }
  await flushOutbox();
  return users.length;
}

export async function scheduleClass(
  input: {
    batchId: string;
    title: string;
    description?: string;
    date: string;
    time: string;
    durationMin: number;
    hostId: string;
    openToAlumni: boolean;
    manualJoinUrl?: string;
    notify: boolean;
  },
  actor: Actor & { type: "USER" },
) {
  await assertCanSchedule(actor.id, input.batchId);
  const hostId = oid(input.hostId, "Host");
  if (!(await StaffProfile.exists({ _id: hostId }))) throw new ClassError("Choose a host");
  const startsAt = dubaiInstant(input.date, input.time);
  const endsAt = new Date(startsAt.getTime() + input.durationMin * 60_000);
  const session = await ClassSession.create({
    batchId: oid(input.batchId),
    title: input.title,
    description: input.description || null,
    startsAt,
    endsAt,
    hostId,
    openToAlumni: input.openToAlumni,
    manualJoinUrl: input.manualJoinUrl || null,
    createdById: oid(actor.id),
  });
  let warning: string | null = null;
  if (!input.manualJoinUrl) {
    try {
      const organizer = await organizerFor(hostId);
      const g = runtime().google;
      const ev = await g.createMeetEvent(organizer, {
        title: input.title,
        description: input.description,
        start: startsAt,
        end: endsAt,
        requestId: `cls-${session._id}`,
      });
      let spaceName: string | null = null;
      let lastError: string | null = null;
      if (ev.meetingCode) {
        try {
          // Students have no Google accounts and are not on the guest list, so the space must be OPEN.
          spaceName = (await g.configureSpace(organizer, ev.meetingCode, { accessType: "OPEN", autoRecord: true })).name;
        } catch (e) {
          lastError = `Meet settings not applied: ${String(e).slice(0, 300)}`;
          warning =
            "The Meet link was created, but open access/auto-recording could not be set. Students may need to be admitted manually.";
        }
      }
      const me = await MeetEvent.create({
        organizerEmail: organizer,
        calendarEventId: ev.calendarEventId,
        joinUrl: ev.joinUrl,
        meetingCode: ev.meetingCode,
        meetSpaceName: spaceName,
        accessType: spaceName ? "OPEN" : null,
        autoRecord: !!spaceName,
        configSyncedAt: spaceName ? now() : null,
        lastError,
      });
      await ClassSession.updateOne({ _id: session._id }, { $set: { meetEventId: me._id } });
    } catch (e) {
      warning =
        e instanceof ClassError
          ? e.message
          : `Google Meet could not be created (${String(e).slice(0, 200)}). Paste a Meet link on the class to fix it.`;
    }
  }
  await audit({
    actor,
    action: "class.schedule",
    entityType: "ClassSession",
    entityId: String(session._id),
    after: { title: input.title, startsAt, batchId: input.batchId },
  });
  const notified = input.notify
    ? await notifyBatch(session.batchId, "class.scheduled", { id: String(session._id), title: session.title, startsAt })
    : 0;
  return { id: String(session._id), warning, notified };
}

export async function rescheduleClass(
  id: string,
  input: { title: string; description?: string; date: string; time: string; durationMin: number; manualJoinUrl?: string; notify: boolean },
  actor: Actor & { type: "USER" },
) {
  const s = await ClassSession.findById(oid(id, "Class")).lean();
  if (!s) throw new NotFoundError("Class");
  await assertCanSchedule(actor.id, s.batchId);
  if (s.status === "CANCELLED") throw new ClassError("This class was cancelled");
  const startsAt = dubaiInstant(input.date, input.time);
  const endsAt = new Date(startsAt.getTime() + input.durationMin * 60_000);
  await ClassSession.updateOne(
    { _id: s._id },
    { $set: { title: input.title, description: input.description || null, startsAt, endsAt, manualJoinUrl: input.manualJoinUrl || null } },
  );
  const me = s.meetEventId ? await MeetEvent.findById(s.meetEventId).lean() : null;
  if (me) {
    await runtime()
      .google.updateEvent(me.organizerEmail, me.calendarEventId, {
        title: input.title,
        description: input.description,
        start: startsAt,
        end: endsAt,
      })
      .catch((e) => MeetEvent.updateOne({ _id: me._id }, { $set: { lastError: String(e).slice(0, 500) } }));
  }
  await audit({
    actor,
    action: "class.update",
    entityType: "ClassSession",
    entityId: id,
    before: { startsAt: s.startsAt, title: s.title },
    after: { startsAt, title: input.title },
  });
  if (input.notify && startsAt.getTime() !== s.startsAt.getTime())
    await notifyBatch(s.batchId, "class.scheduled", { id, title: input.title, startsAt });
}

export async function cancelClass(id: string, reason: string, notify: boolean, actor: Actor & { type: "USER" }) {
  const s = await ClassSession.findById(oid(id, "Class")).lean();
  if (!s) throw new NotFoundError("Class");
  await assertCanSchedule(actor.id, s.batchId);
  if (s.status === "CANCELLED") return;
  await ClassSession.updateOne({ _id: s._id }, { $set: { status: "CANCELLED", cancelledAt: now(), cancelReason: reason || null } });
  const me = s.meetEventId ? await MeetEvent.findById(s.meetEventId).lean() : null;
  if (me)
    await runtime()
      .google.cancelEvent(me.organizerEmail, me.calendarEventId)
      .catch(() => undefined);
  await audit({ actor, action: "class.cancel", entityType: "ClassSession", entityId: id, after: { reason } });
  if (notify && s.startsAt > now())
    await notifyBatch(s.batchId, "class.cancelled", { id, title: s.title, startsAt: s.startsAt, cancelReason: reason });
}

/** Mongo filter for the sessions a student may see: own batch + later batches once fully paid. */
export async function studentSessionFilter(ent: Entitlements): Promise<Record<string, unknown> | null> {
  if (!ent.live) return null;
  const or: Record<string, unknown>[] = [{ batchId: oid(ent.live.ownBatchId) }];
  if (ent.live.laterBatchesAfter) {
    const later = await Batch.find({ startDate: { $gt: ent.live.laterBatchesAfter } }, { _id: 1 }).lean();
    if (later.length) or.push({ openToAlumni: true, batchId: { $in: later.map((b) => b._id) } });
  }
  return { $or: or };
}

export async function toClassDtos(
  sessions: ClassSessionDoc[],
  opts: { ownBatchId?: string | null; at?: Date; joinWindowMinutes?: number; allRecordings?: boolean } = {},
): Promise<ClassSessionDto[]> {
  const at = opts.at ?? now();
  const [batches, hosts, meets, recs, joins] = await Promise.all([
    Batch.find({ _id: { $in: sessions.map((s) => s.batchId) } }, { name: 1 }).lean(),
    AuthUser.find({ _id: { $in: sessions.map((s) => s.hostId) } }, { name: 1 }).lean(),
    MeetEvent.find({ _id: { $in: sessions.map((s) => s.meetEventId).filter(Boolean) } }).lean(),
    Recording.find(
      { classSessionId: { $in: sessions.map((s) => s._id) }, ...(opts.allRecordings ? {} : { status: "PUBLISHED" }) },
      { classSessionId: 1, status: 1 },
    )
      .sort({ recordedAt: 1 })
      .lean(),
    JoinLog.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { classSessionId: { $in: sessions.map((s) => s._id) } } },
      { $group: { _id: "$classSessionId", n: { $sum: 1 } } },
    ]),
  ]);
  const bn = new Map(batches.map((b) => [String(b._id), b.name]));
  const hn = new Map(hosts.map((h) => [String(h._id), h.name]));
  const mm = new Map(meets.map((m) => [String(m._id), m]));
  const jn = new Map(joins.map((j) => [String(j._id), j.n]));
  return sessions.map((s) => {
    const me = s.meetEventId ? mm.get(String(s.meetEventId)) : undefined;
    const own = recs.filter((r) => String(r.classSessionId) === String(s._id));
    return {
      id: String(s._id),
      batchId: String(s.batchId),
      batchName: bn.get(String(s.batchId)) ?? "",
      title: s.title,
      description: s.description ?? null,
      startsAt: iso(s.startsAt)!,
      endsAt: iso(s.endsAt)!,
      status: s.status,
      hostId: String(s.hostId),
      hostName: hn.get(String(s.hostId)) ?? "",
      openToAlumni: s.openToAlumni ?? true,
      isOwnBatch: opts.ownBatchId ? String(s.batchId) === opts.ownBatchId : true,
      joinable: opts.joinWindowMinutes !== undefined && joinWindowOpen(s, at, opts.joinWindowMinutes) && !!(s.manualJoinUrl || me?.joinUrl),
      manualJoinUrl: s.manualJoinUrl ?? null,
      meet: { hasLink: !!(s.manualJoinUrl || me?.joinUrl), autoRecord: !!me?.autoRecord, lastError: me?.lastError ?? null },
      recordingIds: own.filter((r) => r.status === "PUBLISHED").map((r) => String(r._id)),
      recordings: own.map((r) => ({ id: String(r._id), status: r.status })),
      joins: jn.get(String(s._id)) ?? 0,
    };
  });
}

export async function listStudentClasses(ent: Entitlements) {
  const at = now();
  const windowMinutes = await getSetting("classes.joinWindowMinutes");
  const filter = await studentSessionFilter(ent);
  if (!filter) return { upcoming: [], past: [], joinWindowMinutes: windowMinutes };
  const [upcoming, past] = await Promise.all([
    ClassSession.find({ ...filter, status: "SCHEDULED", endsAt: { $gt: at } })
      .sort({ startsAt: 1 })
      .limit(30)
      .lean(),
    ClassSession.find({ ...filter, endsAt: { $lte: at } })
      .sort({ startsAt: -1 })
      .limit(10)
      .lean(),
  ]);
  const own = ent.live?.ownBatchId ?? null;
  return {
    upcoming: await toClassDtos(upcoming, { ownBatchId: own, at, joinWindowMinutes: windowMinutes }),
    past: await toClassDtos(past, { ownBatchId: own, at }),
    joinWindowMinutes: windowMinutes,
  };
}

/** Gated join: entitlement + time window checked; every join is logged. Returns the real Meet URL. */
export async function resolveJoin(sessionId: string, userId: string, ent: Entitlements | null, isStaff: boolean, ip: string | null) {
  if (!Types.ObjectId.isValid(sessionId)) return { error: "unavailable" as const };
  const s = await ClassSession.findById(sessionId).lean();
  const me = s?.meetEventId ? await MeetEvent.findById(s.meetEventId).lean() : null;
  const url = me?.joinUrl ?? s?.manualJoinUrl;
  if (!s || !url) return { error: "unavailable" as const };
  if (!isStaff) {
    const batch = await Batch.findById(s.batchId, { startDate: 1 }).lean();
    if (
      !ent ||
      !batch ||
      !canAccessLiveSession(ent, { batchId: String(s.batchId), openToAlumni: s.openToAlumni ?? true, batchStartDate: batch.startDate })
    )
      return { error: "forbidden" as const };
    if (!joinWindowOpen(s, now(), await getSetting("classes.joinWindowMinutes"))) return { error: "not-open" as const };
  }
  await JoinLog.create({ classSessionId: s._id, userId: oid(userId), ip });
  return { url };
}

export async function isClassStaff(userId: string, sessionId: string) {
  if (!Types.ObjectId.isValid(sessionId)) return false;
  const s = await ClassSession.findById(sessionId, { hostId: 1, batchId: 1 }).lean();
  if (!s) return false;
  if (String(s.hostId) === userId) return true;
  try {
    await assertCanSchedule(userId, s.batchId);
    return true;
  } catch {
    return false;
  }
}

function scoped(scope: Types.ObjectId[] | "all", field = "batchId") {
  return scope === "all" ? {} : { [field]: { $in: scope } };
}

export async function getStaffOverview(userId: string) {
  const scope = await batchScopeFor(userId);
  const [batches, upcoming] = await Promise.all([
    Batch.find({ ...scoped(scope, "_id"), status: { $in: ["OPEN", "RUNNING"] } })
      .sort({ startDate: -1 })
      .lean(),
    ClassSession.find({ ...scoped(scope), status: "SCHEDULED", endsAt: { $gte: now() } })
      .sort({ startsAt: 1 })
      .limit(6)
      .lean(),
  ]);
  const counts = await Enrollment.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { batchId: { $in: batches.map((b) => b._id) }, status: "ACTIVE" } },
    { $group: { _id: "$batchId", n: { $sum: 1 } } },
  ]);
  const cn = new Map(counts.map((c) => [String(c._id), c.n]));
  return {
    scopeAll: scope === "all",
    batches: batches.map((b) => ({
      id: String(b._id),
      name: b.name,
      startDate: iso(b.startDate)!,
      activeStudents: cn.get(String(b._id)) ?? 0,
    })),
    upcoming: await toClassDtos(upcoming, { allRecordings: true }),
  };
}

export async function getManageClasses(userId: string, q: PageInput = {}) {
  const scope = await batchScopeFor(userId);
  const at = now();
  const [batches, mentors, upcoming, past] = await Promise.all([
    Batch.find({ ...scoped(scope, "_id"), status: { $ne: "ARCHIVED" } }, { name: 1 })
      .sort({ startDate: -1 })
      .lean(),
    listMentors(),
    ClassSession.find({ ...scoped(scope), endsAt: { $gte: at }, status: "SCHEDULED" })
      .sort({ startsAt: 1 })
      .lean(),
    findPage<ClassSessionDoc>(
      ClassSession,
      { ...scoped(scope), $or: [{ endsAt: { $lt: at } }, { status: "CANCELLED" }] },
      { startsAt: -1 },
      q,
      { def: 25 },
    ),
  ]);
  return {
    batches: batches.map((b) => ({ id: String(b._id), name: b.name })),
    hosts: mentors.map((m) => ({ id: m.userId, name: m.name })),
    defaultHostId: mentors.some((m) => m.userId === userId) ? userId : null,
    upcoming: await toClassDtos(upcoming, { allRecordings: true }),
    past: { ...past, rows: await toClassDtos(past.rows, { allRecordings: true }) },
  };
}
