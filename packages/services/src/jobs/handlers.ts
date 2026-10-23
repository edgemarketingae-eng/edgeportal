import { now } from "@edge/domain/clock";
import { dispatchOutbox, type JobPayloads, type QueueName } from "@edge/jobs";
import { runAutolock, runBalanceReminders } from "../enrollment/service";
import { deliverEmail } from "../notifications/email";
import { runtime } from "../runtime";
import { expireStalePayments, reconcileOpenPayments, sweepWebhookInbox } from "../payments/sync";
import { sweepOdooPending, syncPaymentToOdoo } from "../odoo/sync";
import { syncAllStudents, syncStudentToMailerLite } from "../mailerlite/sync";
import { evictCache, fillCache } from "../recordings/cache";
import { discoverMeetRecordings } from "../recordings/service";
import { linkLeadForStudent } from "../crm/autolink";
import { sweepLeadInbox } from "../crm/ingest";
import { runBatchUrgency, runFollowUpDigest, runStaleSweep } from "../crm/jobs";

/**
 * Job handlers keyed by queue, shared by the worker and the dev-only job route.
 * Handlers must be idempotent: BullMQ delivers at least once.
 */
export type Handlers = { [Q in QueueName]?: (data: JobPayloads[Q]) => Promise<unknown> };

const asOf = (d: { asOf?: string }) => (d.asOf ? new Date(d.asOf) : now());

export const baseHandlers: Handlers = {
  "email.send": (d) => deliverEmail(d.notificationLogId),
  "enrollment.autolock": (d) => runAutolock(asOf(d)),
  "enrollment.reminders": (d) => runBalanceReminders(asOf(d)),
  "outbox.sweep": () => dispatchOutbox(runtime().producer),
  "payments.reconcile": () => reconcileOpenPayments(),
  "payments.expire": () => expireStalePayments(),
  "payments.inboxSweep": () => sweepWebhookInbox(),
  "odoo.sync": (d) => syncPaymentToOdoo(d.paymentId),
  "odoo.sweep": () => sweepOdooPending(),
  "mailerlite.sync": (d) => syncStudentToMailerLite(d.userId),
  "mailerlite.fullSync": () => syncAllStudents(),
  "google.discoverRecordings": () => discoverMeetRecordings(),
  "recordings.cacheFill": (d) => fillCache(d.recordingId),
  "recordings.cacheEvict": () => evictCache(),
  "crm.autoLink": (d) => linkLeadForStudent(d.userId, d),
  "crm.followUpDigest": (d) => runFollowUpDigest(asOf(d)),
  "crm.staleSweep": (d) => runStaleSweep(asOf(d)),
  "crm.batchUrgency": (d) => runBatchUrgency(asOf(d)),
  "crm.inboxSweep": () => sweepLeadInbox(),
};

const extra: Handlers = {};

/** Later modules (payments, odoo, mailerlite, recordings) register their handlers here. */
export function registerHandlers(h: Handlers) {
  Object.assign(extra, h);
}

export function allHandlers(): Handlers {
  return { ...baseHandlers, ...extra };
}
