import type { PortalDto } from "@edge/contracts";
import { AuthUser, StudentProfile, Types, withTx } from "@edge/db";
import { now } from "@edge/domain/clock";
import { entitlements, type Entitlements } from "@edge/domain/enrollment/entitlements";
import { enqueueInTx } from "@edge/jobs";
import { audit } from "../audit";
import { getCurrentEnrollment } from "../enrollment/service";
import { mentorNameMap } from "../catalog/service";
import { toEnrollmentDto } from "../mappers";
import { flushOutbox } from "../runtime";
import { getSetting } from "../settings";

type Full = Awaited<ReturnType<typeof getCurrentEnrollment>>;

function entitlementsOf(full: Full, at: Date) {
  return entitlements(
    full ? { id: String(full.e._id), status: full.e.status, paymentState: full.e.paymentState, lockAt: full.e.lockAt ?? null, lockReason: full.e.lockReason ?? null, batchId: String(full.e.batchId), batch: { id: String(full.batch._id), startDate: full.batch.startDate, whatsappGroupUrl: full.batch.whatsappGroupUrl ?? null } } : null,
    at,
  );
}

/** What this student may see and do right now (classes, recordings, join and media checks). */
export async function studentEntitlements(userId: string, at = now()): Promise<Entitlements> {
  return entitlementsOf(await getCurrentEnrollment(userId), at);
}

export async function getStudentPortal(userId: string): Promise<PortalDto> {
  const at = now();
  const full = await getCurrentEnrollment(userId);
  const ent = entitlementsOf(full, at);
  const profile = await getSetting("academy.profile");
  let enrollment: PortalDto["enrollment"] = null;
  if (full) {
    const names = await mentorNameMap([full.batch]);
    enrollment = {
      ...toEnrollmentDto(full.e, full.batch, full.course),
      batch: {
        name: full.batch.name,
        code: full.batch.code,
        startDate: full.batch.startDate.toISOString().slice(0, 10),
        endDate: full.batch.endDate ? full.batch.endDate.toISOString().slice(0, 10) : null,
        scheduleText: full.batch.scheduleText ?? null,
        description: full.batch.description ?? null,
        courseTitle: full.course.title,
        courseDescription: full.course.description ?? null,
        advanceEnabled: full.batch.advanceEnabled ?? true,
        advancePresetsMinor: [...(full.batch.advancePresetsMinor ?? [])].sort((a, b) => a - b),
        mentors: (full.batch.mentors ?? []).map((m) => ({ name: names.get(String(m.userId))?.name ?? "", title: names.get(String(m.userId))?.title ?? null, isLead: !!m.isLead })),
      },
    };
  }
  return {
    enrollment,
    entitlements: { banner: ent.banner, active: ent.active, fullyPaid: ent.fullyPaid, canCheckout: ent.canCheckout, canPayBalance: ent.canPayBalance, whatsappGroupUrl: ent.whatsappGroupUrl, mentorship: ent.mentorship },
    supportEmail: profile.supportEmail,
    now: at.toISOString(),
  };
}

export async function updateStudentProfile(userId: string, input: { name: string; jetaFxClientId: string; marketingConsent: boolean }) {
  const _id = new Types.ObjectId(userId);
  const profile = await StudentProfile.findById(_id).lean();
  if (!profile) return;
  const newJeta = input.jetaFxClientId || null;
  const oldJeta = profile.jetaFxClientId ?? null;
  await withTx(async () => {
    await AuthUser.updateOne({ _id }, { $set: { name: input.name, updatedAt: new Date() } });
    await StudentProfile.updateOne(
      { _id },
      {
        $set: { jetaFxClientId: newJeta, marketingConsent: input.marketingConsent, marketingConsentAt: input.marketingConsent && !profile.marketingConsent ? new Date() : (profile.marketingConsentAt ?? null) },
        ...(newJeta !== oldJeta ? { $push: { jetaFxHistory: { oldValue: oldJeta, newValue: newJeta, changedById: _id, changedAt: new Date() } } } : {}),
      },
    );
    if (newJeta !== oldJeta) {
      await audit({ actor: { type: "USER", id: userId }, action: "student.jetaFxId.change", entityType: "StudentProfile", entityId: userId, before: { jetaFxClientId: oldJeta }, after: { jetaFxClientId: newJeta } });
    }
    await enqueueInTx("mailerlite.sync", { userId }, { dedupeId: `ml-${userId}`, delayMs: 30_000 });
  });
  await flushOutbox();
}
