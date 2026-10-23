/** Shared enum values (also used as Mongoose enums). */
export const ENROLLMENT_STATUSES = ["PENDING_PAYMENT", "PENDING_APPROVAL", "ACTIVE", "LOCKED", "REJECTED", "CANCELLED"] as const;
export const PAYMENT_STATES = ["UNPAID", "PARTIALLY_PAID", "PAID"] as const;
export const LOCK_REASONS = ["AUTO_OVERDUE", "MANUAL"] as const;
export const ENROLLMENT_SOURCES = ["AUTO_CURRENT_BATCH", "STAFF_ASSIGNED", "LEGACY_IMPORT", "CRM_CONVERTED"] as const;
export const VAT_TREATMENTS = ["STANDARD", "ZERO_RATED"] as const;
export const BATCH_STATUSES = ["DRAFT", "OPEN", "RUNNING", "COMPLETED", "ARCHIVED"] as const;
export const BALANCE_DUE_RULES = ["FIXED_DATE", "DAYS_AFTER_FIRST_PAYMENT"] as const;
export const PAYMENT_KINDS = ["FULL", "ADVANCE", "BALANCE", "MANUAL"] as const;
export const GATEWAYS = ["STRIPE", "NOMOD", "TABBY", "TAMARA", "MANUAL", "MOCK"] as const;
export const PAYMENT_STATUSES = ["CREATED", "PENDING", "AUTHORIZED", "SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED"] as const;
export const SYNC_STATUSES = ["PENDING", "IN_PROGRESS", "SYNCED", "FAILED", "SKIPPED"] as const;
export const CLASS_STATUSES = ["SCHEDULED", "CANCELLED", "COMPLETED"] as const;
export const RECORDING_SOURCES = ["MEET_AUTO", "MANUAL_DRIVE"] as const;
export const RECORDING_STATUSES = ["DISCOVERED", "PUBLISHED", "HIDDEN", "ERROR"] as const;
export const CACHE_STATES = ["NONE", "FILLING", "READY", "EVICTED", "ERROR"] as const;
export const CHANNELS = ["EMAIL", "SMS", "WHATSAPP", "IN_APP"] as const;
export const DELIVERY_STATUSES = ["QUEUED", "SENT", "DELIVERED", "FAILED", "BOUNCED", "SKIPPED"] as const;
export const ACTOR_TYPES = ["USER", "SYSTEM", "WEBHOOK"] as const;

export type Gateway = (typeof GATEWAYS)[number];
export type PaymentKind = (typeof PAYMENT_KINDS)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type SyncStatus = (typeof SYNC_STATUSES)[number];
export type ActorType = (typeof ACTOR_TYPES)[number];
export type Actor = { type: "USER"; id: string } | { type: "SYSTEM"; id?: string } | { type: "WEBHOOK"; id?: string };
