import { ACTOR_TYPES, ENROLLMENT_SOURCES, ENROLLMENT_STATUSES, LOCK_REASONS, PAYMENT_STATES, VAT_TREATMENTS } from "@edge/domain/enums";
import { Schema, model, type InferSchemaType, type Types } from "mongoose";
import { money, ObjectId, timestamps } from "./shared";

const enrollmentSchema = new Schema(
  {
    studentId: { type: ObjectId, required: true },
    batchId: { type: ObjectId, required: true },
    source: { type: String, enum: ENROLLMENT_SOURCES, required: true },
    status: { type: String, enum: ENROLLMENT_STATUSES, default: "PENDING_PAYMENT", required: true },
    paymentState: { type: String, enum: PAYMENT_STATES, default: "UNPAID", required: true },
    isCurrent: { type: Boolean, default: true },
    currency: { type: String, default: "AED" },
    feeMinor: money(),
    vatTreatment: { type: String, enum: [...VAT_TREATMENTS, null], default: null },
    taxCountry: { type: String, default: null },
    paidCourseMinor: { ...money(), default: 0 },
    balanceDueOn: { type: Date, default: null },
    lockAt: { type: Date, default: null },
    lockReason: { type: String, enum: [...LOCK_REASONS, null], default: null },
    lockedAt: { type: Date, default: null },
    lockedById: { type: ObjectId, default: null },
    lockNote: { type: String, default: null },
    approvedAt: { type: Date, default: null },
    approvedById: { type: ObjectId, default: null },
    rejectedAt: { type: Date, default: null },
    rejectedById: { type: ObjectId, default: null },
    rejectionReason: { type: String, default: null },
    firstPaidAt: { type: Date, default: null },
    fullyPaidAt: { type: Date, default: null },
    rev: { type: Number, default: 0 },
  },
  { ...timestamps, collection: "enrollments" },
);
enrollmentSchema.index({ studentId: 1, batchId: 1 }, { unique: true });
enrollmentSchema.index({ studentId: 1 }, { unique: true, partialFilterExpression: { isCurrent: true }, name: "one_current_enrollment_per_student" });
enrollmentSchema.index({ status: 1, paymentState: 1, lockAt: 1 });
enrollmentSchema.index({ batchId: 1, status: 1 });
enrollmentSchema.index({ paymentState: 1, status: 1, balanceDueOn: 1 });

const enrollmentEventSchema = new Schema(
  {
    enrollmentId: { type: ObjectId, required: true },
    type: { type: String, required: true },
    fromStatus: { type: String, default: null },
    toStatus: { type: String, default: null },
    data: { type: Schema.Types.Mixed, default: {} },
    actorType: { type: String, enum: ACTOR_TYPES, required: true },
    actorId: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: "enrollmentEvents" },
);
enrollmentEventSchema.index({ enrollmentId: 1, createdAt: -1 });

export const Enrollment = model("Enrollment", enrollmentSchema);
export const EnrollmentEvent = model("EnrollmentEvent", enrollmentEventSchema);

export type EnrollmentDoc = InferSchemaType<typeof enrollmentSchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
export type EnrollmentEventDoc = InferSchemaType<typeof enrollmentEventSchema> & { _id: Types.ObjectId; createdAt: Date };
