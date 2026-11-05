import { dubaiDateString } from "@edge/domain/dates";
import { createStaff } from "@edge/services";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CONSOLE, closeTestDb, INTERNAL, resetDb, signedUpStudent, startApi } from "./helpers";

let app: Awaited<ReturnType<typeof startApi>>["app"];
beforeAll(async () => {
  ({ app } = await startApi());
});
afterAll(closeTestDb);
beforeEach(resetDb);

let seq = 0;
async function staffAgent(role: string, name?: string) {
  seq += 1;
  const email = `upd-${role}-${seq}-${Date.now()}@edge.test`;
  const { id } = await createStaff(
    { name: name ?? `${role} ${seq}`, email, roleKeys: [role], password: "StaffPass!2026" },
    { type: "SYSTEM" },
  );
  const agent = request.agent(app);
  await agent
    .post("/api/v1/auth/sign-in")
    .set("Origin", CONSOLE)
    .send({ identifier: email, password: "StaffPass!2026", app: "console" })
    .expect(200);
  return { agent, id };
}

const today = () => dubaiDateString(new Date());

describe("work updates", () => {
  it("lets any staff account write its own update without an HR record, and keeps everyone else's to HR", async () => {
    const exec = await staffAgent("sales_executive", "Sam Seller");
    const mine = await exec.agent.get("/api/v1/hr/me/updates").set(INTERNAL).expect(200);
    expect(mine.body).toMatchObject({ today: today(), day: today(), items: [], updatedAt: null });

    const saved = await exec.agent
      .post("/api/v1/hr/me/updates")
      .set(INTERNAL)
      .send({ day: today(), items: ["Called 10 leads", ""] })
      .expect(200);
    expect(saved.body.message).toBe("Update saved.");
    const again = await exec.agent.get("/api/v1/hr/me/updates").set(INTERNAL).expect(200);
    expect(again.body.items).toEqual(["Called 10 leads"]);

    await exec.agent.get("/api/v1/hr/updates").set(INTERNAL).expect(403);
    await exec.agent.get(`/api/v1/hr/updates/people/${exec.id}`).set(INTERNAL).expect(403);
    const admin = await staffAgent("admin");
    await admin.agent.get("/api/v1/hr/updates").set(INTERNAL).expect(403);

    for (const role of ["hr_manager", "super_admin"]) {
      const reader = await staffAgent(role);
      const day = await reader.agent.get("/api/v1/hr/updates").set(INTERNAL).expect(200);
      expect(day.body.rows).toEqual([
        expect.objectContaining({ person: expect.objectContaining({ name: "Sam Seller" }), items: ["Called 10 leads"] }),
      ]);
      const person = await reader.agent.get(`/api/v1/hr/updates/people/${exec.id}`).set(INTERNAL).expect(200);
      expect(person.body.rows).toHaveLength(1);
    }

    const cleared = await exec.agent.post("/api/v1/hr/me/updates").set(INTERNAL).send({ day: today(), items: [] }).expect(200);
    expect(cleared.body.message).toBe("Update cleared.");
  });

  it("refuses too many or too long points, and future days", async () => {
    const exec = await staffAgent("employee");
    await exec.agent
      .post("/api/v1/hr/me/updates")
      .set(INTERNAL)
      .send({ day: today(), items: Array(21).fill("x") })
      .expect(400);
    await exec.agent
      .post("/api/v1/hr/me/updates")
      .set(INTERNAL)
      .send({ day: today(), items: ["x".repeat(301)] })
      .expect(400);
    const next = new Date(Date.now() + 2 * 86_400_000);
    const res = await exec.agent
      .post("/api/v1/hr/me/updates")
      .set(INTERNAL)
      .send({ day: dubaiDateString(next), items: ["x"] })
      .expect(400);
    expect(res.body.error.fieldErrors.day).toBeTruthy();
  });

  it("refuses students", async () => {
    const { agent } = await signedUpStudent(app);
    await agent.get("/api/v1/hr/me/updates").set(INTERNAL).expect(403);
  });
});
