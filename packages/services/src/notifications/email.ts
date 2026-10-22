import { isDuplicateKey, NotificationLog, Types } from "@edge/db";
import { enqueueInTx } from "@edge/jobs";
import { now } from "@edge/domain/clock";
import { runtime } from "../runtime";
import { renderEmail, type TemplateData, type TemplateName } from "./templates";

export interface QueueEmailInput<T extends TemplateName> {
  to: string;
  template: T;
  data: TemplateData[T];
  userId?: string | Types.ObjectId | null;
  /** Prevents duplicates, e.g. `reminder:<enrollmentId>:<date>`. */
  dedupeKey?: string;
}

/**
 * Writes the email to the NotificationLog outbox and an outbox job to deliver it.
 * Inside withTx() both rows join the transaction (so a rolled-back transaction sends nothing);
 * call flushOutbox() after commit. Returns null when the dedupe key was already used.
 */
export async function queueEmail<T extends TemplateName>(input: QueueEmailInput<T>): Promise<string | null> {
  // A duplicate-key error would abort a surrounding transaction, so check first.
  if (input.dedupeKey && (await NotificationLog.exists({ dedupeKey: input.dedupeKey }))) return null;
  try {
    const [log] = await NotificationLog.create([
      {
        userId: input.userId ? new Types.ObjectId(String(input.userId)) : null,
        channel: "EMAIL",
        template: input.template,
        to: input.to,
        provider: runtime().email.provider,
        dedupeKey: input.dedupeKey ?? null,
        payload: input.data,
      },
    ]);
    await enqueueInTx("email.send", { notificationLogId: String(log!._id) }, { dedupeId: `email-${log!._id}` });
    return String(log!._id);
  } catch (e) {
    if (isDuplicateKey(e)) return null;
    throw e;
  }
}

/** Worker: render and deliver one queued email. Throws so BullMQ retries transient failures. */
export async function deliverEmail(notificationLogId: string) {
  const log = await NotificationLog.findById(notificationLogId).lean();
  if (!log || ["SENT", "DELIVERED", "SKIPPED"].includes(log.status ?? "")) return { skipped: true };
  const rendered = renderEmail(log.template as TemplateName, log.payload as never);
  try {
    const res = await runtime().email.send({ to: log.to, ...rendered, tags: [log.template] });
    await NotificationLog.updateOne({ _id: log._id }, { $set: { status: "SENT", sentAt: now(), providerMessageId: res.providerMessageId ?? null, error: null } });
    return { sent: true };
  } catch (e) {
    await NotificationLog.updateOne({ _id: log._id }, { $set: { status: "FAILED", error: String(e).slice(0, 2000) } });
    throw e;
  }
}
