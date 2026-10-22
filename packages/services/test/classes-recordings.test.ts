import { rm, stat } from "node:fs/promises";
import { Batch, ClassSession, JoinLog, MeetEvent, Recording } from "@edge/db";
import { closeTestDb, connectTestDb, resetDb } from "@edge/db/testing";
import { freezeClock, setClock } from "@edge/domain/clock";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addRecordingFromDrive,
  approveEnrollment,
  cacheDir,
  cancelClass,
  createStaff,
  discoverMeetRecordings,
  ensureCurrentEnrollment,
  evictCache,
  fillCache,
  ForbiddenError,
  getWatch,
  listStudentClasses,
  listStudentRecordings,
  parseRange,
  recordManualPayment,
  RecordingError,
  rescheduleClass,
  resolveJoin,
  runtime,
  scheduleClass,
  signMediaToken,
  studentEntitlements,
  verifyMediaToken,
} from "../src";
import { createBatch, createStudent, producer, sent } from "./helpers";

beforeAll(connectTestDb);
afterAll(async () => {
  await rm(cacheDir(), { recursive: true, force: true });
  await closeTestDb();
});
beforeEach(async () => {
  await resetDb();
  producer.take();
  sent.length = 0;
  freezeClock("2026-10-06T10:00:00Z");
});
afterEach(() => {
  setClock(null);
  vi.restoreAllMocks();
});

let seq = 0;
async function staff(roleKeys: string[], workspaceEmail?: string) {
  seq += 1;
  const { id } = await createStaff({ name: `Staff ${seq}`, email: `staff${seq}-${Date.now()}@edge.test`, roleKeys, workspaceEmail, password: "StaffPass!2026" }, { type: "SYSTEM" });
  return id;
}

/** A fully-paid, approved student in a batch mentored by `mentor`. */
async function setup() {
  const batch = await createBatch();
  const mentor = await staff(["mentor"], "mentor@edgeacademy.ae");
  await Batch.updateOne({ _id: batch._id }, { $push: { mentors: { userId: mentor, isLead: true } } });
  const admin = await staff(["admin"]);
  const student = await createStudent();
  const e = await ensureCurrentEnrollment(student, { type: "USER", id: student });
  await recordManualPayment({ studentId: student, kind: "FULL", method: "CASH", reference: "R1", actor: { type: "USER", id: admin } });
  await approveEnrollment(String(e!._id), { type: "USER", id: admin });
  producer.take();
  sent.length = 0;
  return { batchId: String(batch._id), mentor, admin, student };
}

const input = (batchId: string, hostId: string, over: Partial<{ date: string; time: string }> = {}) => ({
  batchId,
  hostId,
  title: "Session 1: Market structure",
  date: over.date ?? "2026-11-02",
  time: over.time ?? "20:00",
  durationMin: 90,
  openToAlumni: true,
  notify: true,
});

describe("classes", () => {
  it("mentor schedules a Meet class for own batch; students are emailed; cancel notifies", async () => {
    const { batchId, mentor } = await setup();
    const r = await scheduleClass(input(batchId, mentor), { type: "USER", id: mentor });
    expect(r.warning).toBeNull();
    expect(r.notified).toBe(1);
    const s = await ClassSession.findById(r.id).lean();
    expect(s!.startsAt.toISOString()).toBe("2026-11-02T16:00:00.000Z"); // 20:00 Dubai
    const me = await MeetEvent.findById(s!.meetEventId).lean();
    expect(me).toMatchObject({ accessType: "OPEN", autoRecord: true, organizerEmail: "mentor@edgeacademy.ae" });
    expect(me!.joinUrl).toMatch(/^https:\/\/meet\.google\.com\//);
    expect(producer.take().filter((j) => j.queue === "email.send")).toHaveLength(1);

    await rescheduleClass(r.id, { ...input(batchId, mentor, { time: "21:00" }), notify: true }, { type: "USER", id: mentor });
    expect((await ClassSession.findById(r.id).lean())!.startsAt.toISOString()).toBe("2026-11-02T17:00:00.000Z");
    expect(producer.take().filter((j) => j.queue === "email.send")).toHaveLength(1);

    await cancelClass(r.id, "Mentor unwell", true, { type: "USER", id: mentor });
    expect((await ClassSession.findById(r.id).lean())!.status).toBe("CANCELLED");
    expect(producer.take().filter((j) => j.queue === "email.send")).toHaveLength(1);
    await cancelClass(r.id, "again", true, { type: "USER", id: mentor }); // idempotent
    expect(producer.take()).toHaveLength(0);
  });

  it("a mentor cannot schedule for a batch they do not teach; a missing workspace email is a warning", async () => {
    const { mentor, admin } = await setup();
    const other = await createBatch({ current: false, code: "OTHER-1" });
    await expect(scheduleClass(input(String(other._id), mentor), { type: "USER", id: mentor })).rejects.toBeInstanceOf(ForbiddenError);

    // An admin may schedule anywhere; with no Workspace email for the host the class is still created.
    const r = await scheduleClass({ ...input(String(other._id), admin), notify: false }, { type: "USER", id: admin });
    expect(r.warning).toMatch(/Google Workspace email/);
    expect((await ClassSession.findById(r.id).lean())!.meetEventId).toBeNull();
  });

  it("students see own-batch classes, join only inside the window, and every join is logged", async () => {
    const { batchId, mentor, student } = await setup();
    const { id } = await scheduleClass({ ...input(batchId, mentor), notify: false }, { type: "USER", id: mentor });
    const ent = await studentEntitlements(student);
    const list = await listStudentClasses(ent);
    expect(list.upcoming.map((c) => c.id)).toEqual([id]);
    expect(list.upcoming[0]).toMatchObject({ joinable: false, isOwnBatch: true, meet: { hasLink: true } });

    expect(await resolveJoin(id, student, ent, false, null)).toEqual({ error: "not-open" });
    freezeClock("2026-11-02T15:50:00Z"); // 10 minutes before the 20:00 Dubai start
    const open = await resolveJoin(id, student, await studentEntitlements(student), false, "1.2.3.4");
    expect(open.url).toMatch(/^https:\/\/meet\.google\.com\//);
    expect((await listStudentClasses(await studentEntitlements(student))).upcoming[0]!.joinable).toBe(true);

    const outsider = await createStudent();
    expect(await resolveJoin(id, outsider, await studentEntitlements(outsider), false, null)).toEqual({ error: "forbidden" });
    expect(await resolveJoin(id, mentor, null, true, null)).toHaveProperty("url"); // staff skip window and entitlement
    expect(await JoinLog.countDocuments({ classSessionId: id })).toBe(2);
  });
});

describe("recordings", () => {
  const driveUrl = "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/view?usp=sharing";

  it("adds a Drive recording once, caches it exactly once, and only the student's batch can watch", async () => {
    const { batchId, mentor, student } = await setup();
    const { id } = await addRecordingFromDrive({ batchId, driveUrl, title: "Session 1", publish: true }, { type: "USER", id: mentor });
    const rec = await Recording.findById(id).lean();
    expect(rec).toMatchObject({ driveFileId: "1AbCdEfGhIjKlMnOpQrStUv", status: "PUBLISHED", source: "MANUAL_DRIVE" });
    expect(producer.take().map((j) => j.queue)).toContain("recordings.cacheFill");
    await expect(addRecordingFromDrive({ batchId, driveUrl, title: "Again", publish: true }, { type: "USER", id: mentor })).rejects.toBeInstanceOf(RecordingError);

    const results = await Promise.all([fillCache(id), fillCache(id), fillCache(id)]);
    expect(results.filter((r) => "ready" in r)).toHaveLength(1);
    const cached = await Recording.findById(id).lean();
    expect(cached!.cache).toMatchObject({ state: "READY" });
    const size = (await stat(cached!.cache!.path!)).size; // may differ from Drive's bytes after the faststart remux
    expect(cached!.sizeBytes).toBe(size);
    expect(size).toBeGreaterThan(0);
    expect(await fillCache(id)).toEqual({ skipped: "ready" });

    const ent = await studentEntitlements(student);
    expect((await listStudentRecordings(ent)).map((r) => r.id)).toEqual([id]);
    const watch = await getWatch(id, student, ent, { ip: null, userAgent: "vitest" });
    expect(watch.src).toMatch(new RegExp(`/api/media/recordings/${id}\\?t=`));
    expect(watch.watermark).toMatch(/^Student \d+ · \+971•••/);

    const outsider = await createStudent();
    await expect(getWatch(id, outsider, await studentEntitlements(outsider), { ip: null, userAgent: null })).rejects.toThrow(/not found/i);
  });

  it("discovers Meet recordings once, even when two discovery runs overlap", async () => {
    const { batchId, mentor } = await setup();
    const { id } = await scheduleClass({ ...input(batchId, mentor), notify: false }, { type: "USER", id: mentor });
    vi.spyOn(runtime().google, "listRecordings").mockResolvedValue([
      { name: "conferenceRecords/a/recordings/1", state: "FILE_GENERATED", startTime: "2026-11-02T16:01:00Z", endTime: "2026-11-02T17:00:00Z", driveFileId: "drive-1" },
      { name: "conferenceRecords/a/recordings/2", state: "FILE_GENERATED", startTime: "2026-11-02T17:05:00Z", endTime: "2026-11-02T17:30:00Z", driveFileId: "drive-2" },
      { name: "conferenceRecords/a/recordings/3", state: "STARTED", startTime: null, endTime: null, driveFileId: null },
    ]);
    freezeClock("2026-11-02T18:00:00Z");
    const runs = await Promise.all([discoverMeetRecordings(), discoverMeetRecordings()]);
    expect(runs.reduce((n, r) => n + r.created, 0)).toBe(2);
    const recs = await Recording.find({ classSessionId: id }).sort({ recordedAt: 1 }).lean();
    expect(recs.map((r) => [r.title, r.status, r.durationSec])).toEqual([
      ["Session 1: Market structure (part 1)", "PUBLISHED", 3540],
      ["Session 1: Market structure (part 2)", "PUBLISHED", 1500],
    ]);
    expect((await ClassSession.findById(id).lean())!.status).toBe("COMPLETED");
    expect((await discoverMeetRecordings()).created).toBe(0);
  });

  it("evicts least recently served files over the size limit, never ones being watched", async () => {
    const { batchId, mentor } = await setup();
    const a = await addRecordingFromDrive({ batchId, driveUrl: "https://drive.google.com/file/d/fileAAAAAAAAAAAAAAAAAAAA/view", title: "A", publish: true }, { type: "USER", id: mentor });
    const b = await addRecordingFromDrive({ batchId, driveUrl: "https://drive.google.com/file/d/fileBBBBBBBBBBBBBBBBBBBB/view", title: "B", publish: true }, { type: "USER", id: mentor });
    await fillCache(a.id);
    await fillCache(b.id);
    await Recording.updateOne({ _id: a.id }, { $set: { "cache.lastServedAt": new Date("2026-10-01T00:00:00Z") } });
    await Recording.updateOne({ _id: b.id }, { $set: { "cache.lastServedAt": new Date("2026-10-06T09:59:00Z") } }); // watched a minute ago
    const out = await evictCache(0);
    expect(out.evicted).toBe(1);
    expect((await Recording.findById(a.id).lean())!.cache).toMatchObject({ state: "EVICTED", path: null });
    expect((await Recording.findById(b.id).lean())!.cache).toMatchObject({ state: "READY" });
  });
});

describe("media token", () => {
  it("round-trips and binds to recording and expiry", () => {
    const t = signMediaToken("rec1", "user1", 1_000_000_000_000);
    expect(verifyMediaToken("rec1", t, 1_000_000_000_000)).toEqual({ userId: "user1" });
    expect(verifyMediaToken("rec2", t, 1_000_000_000_000)).toBeNull();
    expect(verifyMediaToken("rec1", t, 1_000_000_000_000 + 3 * 3600_000)).toBeNull();
    expect(verifyMediaToken("rec1", "garbage", 1_000_000_000_000)).toBeNull();
  });

  it("parses open, closed, suffix and invalid ranges", () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange("bytes=0-", 100)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19 });
    expect(parseRange("bytes=90-500", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=100-", 100)).toBe("invalid");
    expect(parseRange("items=0-1", 100)).toBe("invalid");
  });
});
