import { ACTOR_TYPES, CHANNELS, DELIVERY_STATUSES } from "@edge/domain/enums";
import { Schema, model, type InferSchemaType, type Types } from "mongoose";
import { ObjectId, partialUnique } from "./shared";

const created = { timestamps: { createdAt: true, updatedAt: false }, versionKey: false } as const;

/** Email (and later WhatsApp) outbox + delivery log. dedupeKey makes reminders exactly-once. */
const notificationLogSchema = new Schema(
  {
    userId: { type: ObjectId, default: null },
    channel: { type: String, enum: CHANNELS, required: true },
    template: { type: String, required: true },
    to: { type: String, required: true },
    provider: { type: String, required: true },
    providerMessageId: { type: String, default: null },
    status: { type: String, enum: DELIVERY_STATUSES, default: "QUEUED" },
    dedupeKey: { type: String, default: null },
    payload: { type: Schema.Types.Mixed, default: {} },
    error: { type: String, default: null },
    sentAt: { type: Date, default: null },
  },
  { ...created, collection: "notificationLogs" },
);
notificationLogSchema.index({ dedupeKey: 1 }, partialUnique("dedupeKey"));
notificationLogSchema.index({ userId: 1, createdAt: -1 });
notificationLogSchema.index({ status: 1, createdAt: 1 });

const inAppSchema = new Schema(
  { userId: { type: ObjectId, required: true }, title: String, body: String, href: { type: String, default: null }, readAt: { type: Date, default: null } },
  { ...created, collection: "inAppNotifications" },
);
inAppSchema.index({ userId: 1, readAt: 1, createdAt: -1 });

const auditLogSchema = new Schema(
  {
    actorType: { type: String, enum: ACTOR_TYPES, required: true },
    actorId: { type: String, default: null },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { ...created, collection: "auditLogs" },
);
auditLogSchema.index({ entityType: 1, entityId: 1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

/** OTP send throttle; TTL index replaces a cleanup job. */
const otpThrottleSchema = new Schema({ key: { type: String, required: true } }, { ...created, collection: "otpThrottles" });
otpThrottleSchema.index({ key: 1, createdAt: -1 });
otpThrottleSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2 * 24 * 3600 });

/** Jobs written inside a transaction; published to BullMQ after commit (and by a sweeper). */
const jobOutboxSchema = new Schema(
  {
    queue: { type: String, required: true },
    data: { type: Schema.Types.Mixed, default: {} },
    dedupeId: { type: String, default: null },
    delayMs: { type: Number, default: 0 },
    status: { type: String, enum: ["PENDING", "PUBLISHED"], default: "PENDING" },
    publishedAt: { type: Date, default: null },
  },
  { ...created, collection: "jobOutbox" },
);
jobOutboxSchema.index({ status: 1, createdAt: 1 });
jobOutboxSchema.index({ publishedAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });

export const NotificationLog = model("NotificationLog", notificationLogSchema);
export const InAppNotification = model("InAppNotification", inAppSchema);
export const AuditLog = model("AuditLog", auditLogSchema);
export const OtpThrottle = model("OtpThrottle", otpThrottleSchema);
export const JobOutbox = model("JobOutbox", jobOutboxSchema);

export type NotificationLogDoc = InferSchemaType<typeof notificationLogSchema> & { _id: Types.ObjectId; createdAt: Date };
export type JobOutboxDoc = InferSchemaType<typeof jobOutboxSchema> & { _id: Types.ObjectId; createdAt: Date };
