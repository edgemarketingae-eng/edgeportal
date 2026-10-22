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
];
