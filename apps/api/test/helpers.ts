import { Batch, Course } from "@edge/db";
import { closeTestDb, connectTestDb, resetDb } from "@edge/db/testing";
import { CaptureProducer } from "@edge/jobs";
import { configureRuntime } from "@edge/services";
import type { EmailSender, OutgoingEmail } from "@edge/integrations/email/index";
import request from "supertest";
import { createApp } from "../src/app";
import { createAuth } from "../src/auth";

export const STUDENT = "http://student.localhost:3000";
export const CONSOLE = "http://console.localhost:3001";
export const INTERNAL = { "x-internal-token": "test-internal-token-0123456789abcdef" };

export class CaptureEmail implements EmailSender {
  readonly provider = "capture";
  sent: OutgoingEmail[] = [];
  async send(e: OutgoingEmail) {
    this.sent.push(e);
    return { providerMessageId: `cap-${this.sent.length}` };
  }
}

export const producer = new CaptureProducer();
export const email = new CaptureEmail();

export async function startApi() {
  await connectTestDb();
  configureRuntime({ producer, email });
  const auth = createAuth();
  const app = createApp({ auth, logger: false });
  return { app, auth };
}

export { closeTestDb, resetDb };

export async function createCurrentBatch() {
  const course = await Course.create({ code: "FX", slug: "fx", title: "Forex Pro" });
  return Batch.create({
    courseId: course._id,
    code: "FX-B1",
    name: "Batch 1",
    startDate: new Date("2026-11-01T00:00:00Z"),
    status: "OPEN",
    isCurrentForEnrollment: true,
    feeMinor: 500000,
    advancePresetsMinor: [20000, 30000, 50000],
    whatsappGroupUrl: "https://chat.whatsapp.com/test",
  });
}

let seq = 0;
export function newStudent() {
  seq += 1;
  const n = `${Date.now()}`.slice(-5) + String(seq).padStart(2, "0");
  return { name: "Test Student", email: `student${n}@example.com`, phone: `+97150${n}`, password: "Sup3rSecret!", marketingConsent: true, terms: true };
}

/** Sign up + verify phone; returns a supertest agent carrying the student's session cookie. */
export async function signedUpStudent(app: Parameters<typeof request.agent>[0]) {
  const s = newStudent();
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/student-signup").set("Origin", STUDENT).send(s).expect(200);
  await agent.post("/api/v1/auth/phone/verify").set("Origin", STUDENT).send({ code: "000000" }).expect(200);
  return { agent, s };
}
