import { Batch, Course, StudentProfile, Types } from "@edge/db";
import { CaptureProducer } from "@edge/jobs";
import type { EmailSender, OutgoingEmail } from "@edge/integrations/email/index";
import { configureRuntime, createUserWithPassword } from "../src";

export const producer = new CaptureProducer();
export const sent: OutgoingEmail[] = [];
export const email: EmailSender = { provider: "capture", send: async (e) => (sent.push(e), { providerMessageId: "x" }) };
configureRuntime({ producer, email });

export async function createBatch(overrides: Partial<{ feeMinor: number; presets: number[]; allowCustom: boolean; current: boolean; startDate: Date; code: string }> = {}) {
  const course = (await Course.findOne().lean()) ?? (await Course.create({ code: "FX", slug: "fx", title: "Forex Pro" })).toObject();
  return (
    await Batch.create({
      courseId: course._id,
      code: overrides.code ?? `B-${new Types.ObjectId().toHexString().slice(-6)}`,
      name: "Batch Test",
      startDate: overrides.startDate ?? new Date("2026-11-01T00:00:00Z"),
      status: "OPEN",
      isCurrentForEnrollment: overrides.current ?? true,
      feeMinor: overrides.feeMinor ?? 500000,
      advancePresetsMinor: overrides.presets ?? [20000, 30000, 50000],
      allowCustomAdvance: overrides.allowCustom ?? true,
      balanceDueRule: "DAYS_AFTER_FIRST_PAYMENT",
      balanceDueDays: 30,
      whatsappGroupUrl: "https://chat.whatsapp.com/test",
    })
  ).toObject();
}

let n = 0;
export async function createStudent(country = "AE") {
  n += 1;
  const id = await createUserWithPassword({ name: `Student ${n}`, email: `s${n}-${Date.now()}@example.com`, password: "Sup3rSecret!", mustChangePassword: false });
  const { AuthUser } = await import("@edge/db");
  await AuthUser.updateOne({ _id: id }, { $set: { phoneNumber: `+97150${String(Date.now()).slice(-5)}${String(n).padStart(2, "0")}`, phoneNumberVerified: true } });
  await StudentProfile.create({ _id: id, country });
  return String(id);
}
