import { readFile, rm } from "node:fs/promises";
import { Batch, Enrollment, Recording } from "@edge/db";
import { freezeClock, setClock } from "@edge/domain/clock";
import { approveEnrollment, cacheDir, createStaff, fillCache, recordManualPayment } from "@edge/services";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CONSOLE, closeTestDb, createCurrentBatch, INTERNAL, resetDb, signedUpStudent, startApi, STUDENT } from "./helpers";

let app: Awaited<ReturnType<typeof startApi>>["app"];
beforeAll(async () => {
  ({ app } = await startApi());
});
afterAll(async () => {
  await rm(cacheDir(), { recursive: true, force: true });
  await closeTestDb();
});
beforeEach(async () => {
  await resetDb();
  freezeClock("2026-10-06T10:00:00Z");
});
afterEach(() => setClock(null));

const STUDENT_HOST = new URL(STUDENT).host;

/** Collect the raw response bytes (supertest only buffers text/JSON by default). */
type Parser = Extract<Parameters<request.Test["parse"]>[0], (res: never, cb: never) => void>;
const binary: Parser = (res, cb) => {
  const stream = res as unknown as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  stream.on("data", (c: Buffer) => chunks.push(c));
  stream.on("end", () => cb(null, Buffer.concat(chunks)));
};
const CONSOLE_HOST = new URL(CONSOLE).host;

/** Approved, fully-paid student + a mentor of their batch, each with a signed-in agent. */
async function setup() {
  const batch = await createCurrentBatch();
  const { agent: student } = await signedUpStudent(app);
  const e = await Enrollment.findOne({}).lean();
  const { id: adminId } = await createStaff({ name: "Admin", email: "admin@edge.test", roleKeys: ["admin"], password: "AdminPass!2026" }, { type: "SYSTEM" });
  await recordManualPayment({ studentId: String(e!.studentId), kind: "FULL", method: "CASH", reference: "R1", actor: { type: "USER", id: adminId } });
  await approveEnrollment(String(e!._id), { type: "USER", id: adminId });

  const { id: mentorId } = await createStaff({ name: "Mentor", email: "mentor@edge.test", roleKeys: ["mentor"], workspaceEmail: "mentor@edgeacademy.ae", password: "MentorPass!2026" }, { type: "SYSTEM" });
  await Batch.updateOne({ _id: batch._id }, { $push: { mentors: { userId: mentorId, isLead: true } } });
  const mentor = request.agent(app);
  await mentor.post("/api/v1/auth/sign-in").set("Origin", CONSOLE).send({ identifier: "mentor@edge.test", password: "MentorPass!2026", app: "console" }).expect(200);
  return { batchId: String(batch._id), mentorId, mentor, student };
}

describe("classes API", () => {
  it("mentor schedules a class; the student joins only through the gated redirect inside the window", async () => {
    const { batchId, mentorId, mentor, student } = await setup();
    const manage = await mentor.get("/api/v1/staff/classes").set(INTERNAL).expect(200);
    expect(manage.body.batches.map((b: { id: string }) => b.id)).toEqual([batchId]);
    expect(manage.body.defaultHostId).toBe(mentorId);
    await student.get("/api/v1/staff/classes").set(INTERNAL).expect(403);

    const created = await mentor
      .post("/api/v1/staff/classes")
      .set(INTERNAL)
      .send({ batchId, hostId: mentorId, title: "Live 1", date: "2026-11-02", time: "20:00", durationMin: 90, openToAlumni: true, notify: true })
      .expect(200);
    expect(created.body).toMatchObject({ warning: null, notified: 1 });
    const id = created.body.id as string;

    const classes = await student.get("/api/v1/student/classes").set(INTERNAL).expect(200);
    expect(classes.body.upcoming).toHaveLength(1);
    expect(classes.body.upcoming[0]).toMatchObject({ id, joinable: false, manualJoinUrl: null });
    expect(JSON.stringify(classes.body)).not.toContain("meet.google.com"); // the real link never reaches the page
    await request(app).get("/api/v1/student/classes").expect(404); // internal tier without the token

    const early = await student.get(`/api/join/${id}`).set("x-forwarded-host", STUDENT_HOST).expect(302);
    expect(early.headers.location).toBe("/classes?error=not-open");
    freezeClock("2026-11-02T15:50:00Z");
    const ok = await student.get(`/api/join/${id}`).set("x-forwarded-host", STUDENT_HOST).expect(302);
    expect(ok.headers.location).toMatch(/^https:\/\/meet\.google\.com\//);
    const anon = await request(app).get(`/api/join/${id}`).expect(302);
    expect(anon.headers.location).toBe(`/login?next=${encodeURIComponent(`/api/join/${id}`)}`);
    const bad = await student.get("/api/join/nope").set("x-forwarded-host", STUDENT_HOST).expect(302);
    expect(bad.headers.location).toBe("/classes?error=unavailable");

    // Staff of the class may open it from the console at any time.
    freezeClock("2026-10-06T10:00:00Z");
    const staffJoin = await mentor.get(`/api/join/${id}`).set("x-forwarded-host", CONSOLE_HOST).expect(302);
    expect(staffJoin.headers.location).toMatch(/^https:\/\/meet\.google\.com\//);

    await mentor.post(`/api/v1/staff/classes/${id}/cancel`).set(INTERNAL).send({ reason: "Holiday" }).expect(200);
    expect((await student.get("/api/v1/student/classes").set(INTERNAL).expect(200)).body.upcoming).toHaveLength(0);
  });

  it("streams a recording with byte ranges: Drive proxy before caching, local disk after", async () => {
    const { batchId, mentor, student } = await setup();
    const added = await mentor
      .post("/api/v1/staff/recordings")
      .set(INTERNAL)
      .send({ batchId, driveUrl: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/view", title: "Session 1", publish: true })
      .expect(200);
    const id = added.body.id as string;

    const list = await student.get("/api/v1/student/recordings").set(INTERNAL).expect(200);
    expect(list.body.map((r: { id: string }) => r.id)).toEqual([id]);
    const watch = await student.get(`/api/v1/student/recordings/${id}/watch`).set(INTERNAL).expect(200);
    const src = new URL(watch.body.src);
    expect(src.pathname).toBe(`/api/media/recordings/${id}`);

    const original = await readFile(process.env.MOCK_DRIVE_FILE!);
    const proxied = await request(app).get(`${src.pathname}${src.search}`).set("Range", "bytes=0-1023").buffer(true).parse(binary).expect(206);
    expect(proxied.headers["content-range"]).toBe(`bytes 0-1023/${original.length}`);
    expect(proxied.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    expect(Buffer.compare(proxied.body as Buffer, original.subarray(0, 1024))).toBe(0);

    await fillCache(id);
    const rec = await Recording.findById(id).lean();
    const cached = await readFile(rec!.cache!.path!);
    const ranged = await request(app).get(`${src.pathname}${src.search}`).set("Range", "bytes=100-1123").buffer(true).parse(binary).expect(206);
    expect(ranged.headers["content-range"]).toBe(`bytes 100-1123/${cached.length}`);
    expect(ranged.headers["accept-ranges"]).toBe("bytes");
    expect(Buffer.compare(ranged.body as Buffer, cached.subarray(100, 1124))).toBe(0);
    const head = await request(app).head(`${src.pathname}${src.search}`).expect(200);
    expect(head.headers["content-length"]).toBe(String(cached.length));

    await request(app).get(`/api/media/recordings/${id}?t=bad`).expect(403);
    await request(app).get(`${src.pathname}${src.search}`).set("Range", `bytes=${cached.length + 10}-`).expect(416);

    await mentor.post(`/api/v1/staff/recordings/${id}/status`).set(INTERNAL).send({ status: "HIDDEN" }).expect(200);
    await request(app).get(`${src.pathname}${src.search}`).expect(404);
    await student.get(`/api/v1/student/recordings/${id}/watch`).set(INTERNAL).expect(404);
  });
});
