import { BALANCE_DUE_RULES, BATCH_STATUSES } from "@edge/domain/enums";
import { Schema, model, type InferSchemaType, type Types } from "mongoose";
import { money, ObjectId, timestamps } from "./shared";

const courseSchema = new Schema(
  {
    code: { type: String, required: true },
    slug: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: null },
    isActive: { type: Boolean, default: true },
  },
  { ...timestamps, collection: "courses" },
);
courseSchema.index({ code: 1 }, { unique: true });
courseSchema.index({ slug: 1 }, { unique: true });

const mentorSchema = new Schema({ userId: { type: ObjectId, required: true }, isLead: { type: Boolean, default: false } }, { _id: false });

const batchSchema = new Schema(
  {
    courseId: { type: ObjectId, required: true },
    code: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: null },
    startDate: { type: Date, required: true }, // date-only, UTC midnight
    endDate: { type: Date, default: null },
    scheduleText: { type: String, default: null },
    capacity: { type: Number, default: null },
    status: { type: String, enum: BATCH_STATUSES, default: "DRAFT", required: true },
    isCurrentForEnrollment: { type: Boolean, default: false },
    currency: { type: String, default: "AED" },
    feeMinor: money(),
    advanceEnabled: { type: Boolean, default: true },
    advancePresetsMinor: { type: [Number], default: [] },
    allowCustomAdvance: { type: Boolean, default: true },
    balanceDueRule: { type: String, enum: BALANCE_DUE_RULES, default: "DAYS_AFTER_FIRST_PAYMENT", required: true },
    balanceDueDate: { type: Date, default: null },
    balanceDueDays: { type: Number, default: 30 },
    lockGraceDays: { type: Number, default: 0 },
    whatsappGroupUrl: { type: String, default: null },
    autoPublishRecordings: { type: Boolean, default: true },
    mentors: { type: [mentorSchema], default: [] },
  },
  { ...timestamps, collection: "batches" },
);
batchSchema.index({ code: 1 }, { unique: true });
batchSchema.index({ courseId: 1, status: 1 });
batchSchema.index({ courseId: 1 }, { unique: true, partialFilterExpression: { isCurrentForEnrollment: true }, name: "one_current_batch_per_course" });
batchSchema.index({ "mentors.userId": 1 });

export const Course = model("Course", courseSchema);
export const Batch = model("Batch", batchSchema);

export type CourseDoc = InferSchemaType<typeof courseSchema> & { _id: Types.ObjectId };
export type BatchDoc = InferSchemaType<typeof batchSchema> & { _id: Types.ObjectId };
