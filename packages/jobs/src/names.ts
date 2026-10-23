/** Queue names and payloads shared by producers (api, services) and the worker. */
export const QUEUES = {
  EMAIL_SEND: "email.send",
  PAYMENTS_RECONCILE: "payments.reconcile",
  PAYMENTS_EXPIRE: "payments.expire",
  PAYMENTS_INBOX_SWEEP: "payments.inboxSweep",
  ENROLLMENT_AUTOLOCK: "enrollment.autolock",
  ENROLLMENT_REMINDERS: "enrollment.reminders",
  ODOO_SYNC: "odoo.sync",
  ODOO_SWEEP: "odoo.sweep",
  MAILERLITE_SYNC: "mailerlite.sync",
  MAILERLITE_FULL_SYNC: "mailerlite.fullSync",
  GOOGLE_DISCOVER_RECORDINGS: "google.discoverRecordings",
  RECORDINGS_CACHE_FILL: "recordings.cacheFill",
  RECORDINGS_CACHE_EVICT: "recordings.cacheEvict",
  OUTBOX_SWEEP: "outbox.sweep",
  CRM_AUTO_LINK: "crm.autoLink",
  CRM_FOLLOWUP_DIGEST: "crm.followUpDigest",
  CRM_STALE_SWEEP: "crm.staleSweep",
  CRM_BATCH_URGENCY: "crm.batchUrgency",
  CRM_INBOX_SWEEP: "crm.inboxSweep",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface JobPayloads {
  "email.send": { notificationLogId: string };
  "payments.reconcile": Record<string, never>;
  "payments.expire": Record<string, never>;
  "payments.inboxSweep": Record<string, never>;
  "enrollment.autolock": { asOf?: string };
  "enrollment.reminders": { asOf?: string };
  "odoo.sync": { paymentId: string };
  "odoo.sweep": Record<string, never>;
  "mailerlite.sync": { userId: string };
  "mailerlite.fullSync": Record<string, never>;
  "google.discoverRecordings": Record<string, never>;
  "recordings.cacheFill": { recordingId: string };
  "recordings.cacheEvict": Record<string, never>;
  "outbox.sweep": Record<string, never>;
  "crm.autoLink": { userId: string; phone?: string | null; email?: string | null; reason: "signup" | "verified" | "payment" | "manual"; paymentId?: string | null };
  "crm.followUpDigest": { asOf?: string };
  "crm.staleSweep": { asOf?: string };
  "crm.batchUrgency": { asOf?: string };
  "crm.inboxSweep": Record<string, never>;
}

export interface SendOptions {
  /** BullMQ deduplication id (no ':' allowed). While a job with this id is queued/active, re-adds are ignored. */
  dedupeId?: string;
  delayMs?: number;
}

/** Cron schedules in Asia/Dubai. */
export const SCHEDULES: { id: string; queue: QueueName; pattern: string; data?: object }[] = [
  { id: "enrollment-autolock-hourly", queue: QUEUES.ENROLLMENT_AUTOLOCK, pattern: "5 * * * *" },
  { id: "enrollment-reminders-daily", queue: QUEUES.ENROLLMENT_REMINDERS, pattern: "0 9 * * *" },
  { id: "payments-reconcile", queue: QUEUES.PAYMENTS_RECONCILE, pattern: "*/5 * * * *" },
  { id: "payments-expire", queue: QUEUES.PAYMENTS_EXPIRE, pattern: "20 * * * *" },
  { id: "payments-inbox-sweep", queue: QUEUES.PAYMENTS_INBOX_SWEEP, pattern: "*/5 * * * *" },
  { id: "odoo-sweep", queue: QUEUES.ODOO_SWEEP, pattern: "*/15 * * * *" },
  { id: "google-discover-recordings", queue: QUEUES.GOOGLE_DISCOVER_RECORDINGS, pattern: "*/15 * * * *" },
  { id: "recordings-cache-evict", queue: QUEUES.RECORDINGS_CACHE_EVICT, pattern: "40 * * * *" },
  { id: "mailerlite-full-sync", queue: QUEUES.MAILERLITE_FULL_SYNC, pattern: "30 2 * * *" },
  { id: "outbox-sweep", queue: QUEUES.OUTBOX_SWEEP, pattern: "* * * * *" },
  { id: "crm-followup-digest-daily", queue: QUEUES.CRM_FOLLOWUP_DIGEST, pattern: "0 9 * * *" },
  { id: "crm-batch-urgency-daily", queue: QUEUES.CRM_BATCH_URGENCY, pattern: "15 9 * * *" },
  { id: "crm-stale-sweep-daily", queue: QUEUES.CRM_STALE_SWEEP, pattern: "30 9 * * *" },
  { id: "crm-inbox-sweep", queue: QUEUES.CRM_INBOX_SWEEP, pattern: "*/5 * * * *" },
];
