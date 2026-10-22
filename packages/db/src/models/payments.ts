import { GATEWAYS, PAYMENT_KINDS, PAYMENT_STATUSES, SYNC_STATUSES, VAT_TREATMENTS } from "@edge/domain/enums";
import { Schema, model, type InferSchemaType, type Types } from "mongoose";
import { money, ObjectId, partialUnique, timestamps } from "./shared";

const odooSchema = new Schema(
  {
    status: { type: String, enum: SYNC_STATUSES, default: "PENDING" },
    invoiceId: { type: Number, default: null },
    invoiceName: { type: String, default: null },
    paymentId: { type: Number, default: null },
    invoiceUrl: { type: String, default: null },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: null },
    claimedAt: { type: Date, default: null },
  },
  { _id: false },
);

const paymentSchema = new Schema(
  {
    enrollmentId: { type: ObjectId, required: true },
    studentId: { type: ObjectId, required: true },
    kind: { type: String, enum: PAYMENT_KINDS, required: true },
    gateway: { type: String, enum: GATEWAYS, required: true },
    feeRateKey: { type: String, required: true },
    status: { type: String, enum: PAYMENT_STATUSES, default: "CREATED", required: true },
    currency: { type: String, required: true },
    billingCountry: { type: String, required: true },
    vatTreatment: { type: String, enum: VAT_TREATMENTS, required: true },
    courseMinor: money(),
    courseVatMinor: money(),
    netMinor: money(),
    processingFeeMinor: money(),
    processingFeeVatMinor: money(),
    totalMinor: money(),
    rateSnapshot: { type: Schema.Types.Mixed, default: {} },
    idempotencyKey: { type: String, required: true },
    externalSessionId: { type: String, default: null },
    externalPaymentId: { type: String, default: null },
    externalOrderId: { type: String, default: null },
    checkoutUrl: { type: String, default: null },
    expiresAt: { type: Date, default: null },
    authorizedAt: { type: Date, default: null },
    capturedAt: { type: Date, default: null },
    captureClaimedAt: { type: Date, default: null },
    succeededAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    failureReason: { type: String, default: null },
    recordedById: { type: ObjectId, default: null },
    manualReference: { type: String, default: null },
    notes: { type: String, default: null },
    odoo: { type: odooSchema, default: () => ({}) },
  },
  { ...timestamps, collection: "payments" },
);
paymentSchema.index({ idempotencyKey: 1 }, { unique: true });
paymentSchema.index({ gateway: 1, externalPaymentId: 1 }, { ...partialUnique("externalPaymentId"), name: "gateway_external_payment_unique" });
paymentSchema.index({ status: 1, createdAt: -1 });
paymentSchema.index({ "odoo.status": 1 });
paymentSchema.index({ enrollmentId: 1 });
paymentSchema.index({ externalSessionId: 1 });
paymentSchema.index({ externalOrderId: 1 });
paymentSchema.index({ studentId: 1, status: 1 });

/** Webhook inbox: dedupe + audit trail + reprocessing state. */
const paymentEventSchema = new Schema(
  {
    gateway: { type: String, enum: GATEWAYS, required: true },
    externalEventId: { type: String, required: true },
    type: { type: String, required: true },
    paymentId: { type: ObjectId, default: null },
    signatureOk: { type: Boolean, required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    receivedAt: { type: Date, default: () => new Date() },
    processingAt: { type: Date, default: null },
    processedAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    error: { type: String, default: null },
  },
  { versionKey: false, collection: "paymentEvents" },
);
paymentEventSchema.index({ gateway: 1, externalEventId: 1 }, { unique: true });
paymentEventSchema.index({ paymentId: 1, receivedAt: -1 });
paymentEventSchema.index({ processedAt: 1, receivedAt: 1 });

const feeRateSchema = new Schema(
  {
    key: { type: String, required: true },
    gateway: { type: String, enum: GATEWAYS, required: true },
    label: { type: String, required: true },
    description: { type: String, default: null },
    pct: { type: String, required: true }, // decimal string, 0.0675 = 6.75%
    fixedMinor: money(),
    feeVatRate: { type: String, default: "0.05" },
    countries: { type: [String], default: [] },
    excludeCountries: { type: [String], default: [] },
    minTotalMinor: money(false),
    maxTotalMinor: money(false),
    enabled: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    updatedById: { type: ObjectId, default: null },
  },
  { ...timestamps, collection: "feeRates" },
);
feeRateSchema.index({ key: 1 }, { unique: true });

const settingSchema = new Schema(
  { _id: { type: String, required: true }, value: { type: Schema.Types.Mixed }, updatedById: { type: ObjectId, default: null } },
  { timestamps: { createdAt: false, updatedAt: true }, versionKey: false, collection: "settings" },
);

const odooSyncLogSchema = new Schema(
  {
    paymentId: { type: ObjectId, default: null },
    step: { type: String, required: true },
    ok: { type: Boolean, required: true },
    attempt: { type: Number, required: true },
    request: { type: Schema.Types.Mixed, default: null },
    response: { type: Schema.Types.Mixed, default: null },
    error: { type: String, default: null },
    durationMs: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: "odooSyncLogs" },
);
odooSyncLogSchema.index({ paymentId: 1, createdAt: -1 });

export const Payment = model("Payment", paymentSchema);
export const PaymentEvent = model("PaymentEvent", paymentEventSchema);
export const FeeRate = model("FeeRate", feeRateSchema);
export const Setting = model("Setting", settingSchema);
export const OdooSyncLog = model("OdooSyncLog", odooSyncLogSchema);

export type PaymentDoc = InferSchemaType<typeof paymentSchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
export type PaymentEventDoc = InferSchemaType<typeof paymentEventSchema> & { _id: Types.ObjectId };
export type FeeRateDoc = InferSchemaType<typeof feeRateSchema> & { _id: Types.ObjectId; updatedAt: Date };
