import { CrmDevice, isDuplicateKey, NotificationLog, Types } from "@edge/db";
import { now } from "@edge/domain/clock";
import { enqueueInTx } from "@edge/jobs";
import { runtime } from "../runtime";

export interface QueuePushInput {
  title: string;
  body: string;
  leadId?: string | Types.ObjectId;
  /** Exactly-once: a second push with the same key is dropped. */
  dedupeKey?: string;
}

/**
 * Queues a notification to the person's phone, if they have one signed in. Through the outbox because `withTx` callbacks
 * can run twice; the row holds the device id, never the token.
 */
export async function queuePush(userId: string | Types.ObjectId, input: QueuePushInput): Promise<string | null> {
  const device = await CrmDevice.findOne(
    { userId: new Types.ObjectId(String(userId)), revokedAt: null, fcmToken: { $ne: null } },
    { _id: 1 },
  ).lean();
  if (!device) return null;
  if (input.dedupeKey && (await NotificationLog.exists({ dedupeKey: input.dedupeKey }))) return null;
  try {
    const [log] = await NotificationLog.create([
      {
        userId: new Types.ObjectId(String(userId)),
        channel: "PUSH",
        template: "crm.push",
        to: String(device._id),
        provider: runtime().push.provider,
        dedupeKey: input.dedupeKey ?? null,
        payload: { title: input.title, body: input.body, leadId: input.leadId ? String(input.leadId) : null },
      },
    ]);
    await enqueueInTx("push.send", { notificationLogId: String(log!._id) }, { dedupeId: `push-${log!._id}` });
    return String(log!._id);
  } catch (e) {
    if (isDuplicateKey(e)) return null;
    throw e;
  }
}

/** Worker: send one queued push. Throws so BullMQ retries transient failures. */
export async function deliverPush(notificationLogId: string) {
  const log = await NotificationLog.findById(notificationLogId).lean();
  if (!log || ["SENT", "DELIVERED", "SKIPPED"].includes(log.status ?? "")) return { skipped: true };
  const device = await CrmDevice.findOne({ _id: log.to, revokedAt: null }, { fcmToken: 1 }).lean();
  const skip = (error: string) => NotificationLog.updateOne({ _id: log._id }, { $set: { status: "SKIPPED", error } });
  if (!device?.fcmToken) {
    await skip("No phone to send to");
    return { skipped: true };
  }
  const { title, body, leadId } = log.payload as { title: string; body: string; leadId: string | null };
  try {
    const res = await runtime().push.send({ token: device.fcmToken, title, body, leadId: leadId ?? undefined });
    if (res.tokenInvalid) {
      await CrmDevice.updateOne({ _id: device._id }, { $set: { fcmToken: null } });
      await skip("The phone's push token is no longer valid");
      return { skipped: true };
    }
    await NotificationLog.updateOne(
      { _id: log._id },
      { $set: { status: "SENT", sentAt: now(), providerMessageId: res.providerMessageId ?? null, error: null } },
    );
    return { sent: true };
  } catch (e) {
    await NotificationLog.updateOne({ _id: log._id }, { $set: { status: "FAILED", error: String(e).slice(0, 2000) } });
    throw e;
  }
}
