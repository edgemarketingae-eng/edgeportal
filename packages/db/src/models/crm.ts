import {
  ACTIVITY_DIRECTIONS,
  CALL_OUTCOMES,
  CONVERSION_SOURCES,
  CRM_TASK_STATUSES,
  DEPOSIT_SEQUENCES,
  DEPOSIT_STATUSES,
  EXPERIENCE_LEVELS,
  FOLLOWUP_TYPES,
  LEAD_ACTIVITY_TYPES,
  LEAD_CHANNELS,
  LEAD_LANGUAGES,
  LEAD_SOURCES,
  LEAD_STAGES,
  LEAD_TEMPERATURES,
  PRODUCT_STATUSES,
  PROJECT_STATUSES,
  TASK_PRIORITIES,
} from "@edge/domain/crm/enums";
import { ACTOR_TYPES } from "@edge/domain/enums";
import { Schema, model, type InferSchemaType, type Types } from "mongoose";
import { money, ObjectId, partialUnique, timestamps } from "./shared";

const utmSchema = new Schema(
  {
    source: { type: String, default: null },
    medium: { type: String, default: null },
    campaign: { type: String, default: null },
    content: { type: String, default: null },
    term: { type: String, default: null },
  },
  { _id: false },
);

const consentSchema = new Schema(
  { marketing: { type: Boolean, default: false }, marketingAt: { type: Date, default: null }, whatsapp: { type: Boolean, default: false } },
  { _id: false },
);

/** Free-text answers to the three questions sales asks every lead. */
const qualificationSchema = new Schema(
  { experience: { type: String, default: null }, occupation: { type: String, default: null }, purpose: { type: String, default: null } },
  { _id: false },
);

/**
 * A sales project: a campaign / pipeline container with its own team. Project managers
 * (managerIds) see everything in it; members (memberIds) see their own leads plus the
 * unassigned pool. The default project is open to every CRM user and receives inbound leads.
 */
const projectSchema = new Schema(
  {
    name: { type: String, required: true },
    code: { type: String, required: true },
    description: { type: String, default: null },
    status: { type: String, enum: PROJECT_STATUSES, default: "ACTIVE", required: true },
    courseId: { type: ObjectId, default: null },
    batchId: { type: ObjectId, default: null },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    targetLeads: { type: Number, default: null },
    targetConversions: { type: Number, default: null },
    managerIds: { type: [ObjectId], default: [] },
    memberIds: { type: [ObjectId], default: [] },
    isDefault: { type: Boolean, default: false },
    createdById: { type: ObjectId, default: null },
  },
  { ...timestamps, collection: "crmProjects" },
);
projectSchema.index({ code: 1 }, { unique: true });
projectSchema.index({ managerIds: 1 });
projectSchema.index({ memberIds: 1 });
projectSchema.index({ status: 1, name: 1 });
projectSchema.index({ isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true }, name: "one_default_project" });

/**
 * A prospect before (and after) they become a student. Phone and email are NOT unique:
 * duplicates are a normal CRM state, flagged on create and resolved by merge (mergedIntoId).
 */
const leadSchema = new Schema(
  {
    projectId: { type: ObjectId, required: true },
    name: { type: String, required: true },
    phone: { type: String, default: null }, // E.164
    email: { type: String, default: null }, // lower-case
    country: { type: String, default: null },
    language: { type: String, enum: [...LEAD_LANGUAGES, null], default: null },
    /** The lead's client id at JetaFX, the academy's affiliate broker. */
    jetaFxClientId: { type: String, default: null },
    preferredChannel: { type: String, enum: [...LEAD_CHANNELS, null], default: null },
    source: { type: String, enum: LEAD_SOURCES, required: true },
    sourceDetail: { type: String, default: null },
    utm: { type: utmSchema, default: () => ({}) },
    stage: { type: String, enum: LEAD_STAGES, default: "NEW", required: true },
    stageChangedAt: { type: Date, default: null },
    lostReason: { type: String, default: null },
    lostNote: { type: String, default: null },
    ownerId: { type: ObjectId, default: null },
    assignedAt: { type: Date, default: null },
    courseInterestId: { type: ObjectId, default: null },
    batchInterestId: { type: ObjectId, default: null },
    experienceLevel: { type: String, enum: [...EXPERIENCE_LEVELS, null], default: null },
    qualification: { type: qualificationSchema, default: () => ({}) },
    temperature: { type: String, enum: LEAD_TEMPERATURES, default: "WARM", required: true },
    score: { type: Number, default: 0 },
    tags: { type: [String], default: [] },
    notes: { type: String, default: null },
    consent: { type: consentSchema, default: () => ({}) },
    firstContactedAt: { type: Date, default: null },
    lastContactedAt: { type: Date, default: null },
    lastActivityAt: { type: Date, default: null },
    nextFollowUpAt: { type: Date, default: null },
    studentId: { type: ObjectId, default: null },
    enrollmentId: { type: ObjectId, default: null },
    convertedAt: { type: Date, default: null },
    convertedById: { type: ObjectId, default: null },
    /** Products the lead converted to (mirror of leadConversions, for filters and chips). */
    productIds: { type: [ObjectId], default: [] },
    mergedIntoId: { type: ObjectId, default: null },
    inboundEventId: { type: ObjectId, default: null },
    createdById: { type: ObjectId, default: null },
    rev: { type: Number, default: 0 },
  },
  { ...timestamps, collection: "leads" },
);
leadSchema.index({ phone: 1 });
leadSchema.index({ email: 1 });
leadSchema.index({ projectId: 1, mergedIntoId: 1, stage: 1 });
leadSchema.index({ projectId: 1, ownerId: 1 });
leadSchema.index({ studentId: 1 }, partialUnique("studentId", "objectId"));
leadSchema.index({ mergedIntoId: 1, ownerId: 1, stage: 1, nextFollowUpAt: 1 });
leadSchema.index({ mergedIntoId: 1, stage: 1, lastActivityAt: -1 });
leadSchema.index({ source: 1, createdAt: -1 });
leadSchema.index({ batchInterestId: 1, stage: 1 });
leadSchema.index({ tags: 1 });
leadSchema.index({ createdAt: -1 });
leadSchema.index({ jetaFxClientId: 1 });
leadSchema.index({ productIds: 1 });

/** Append-only timeline per lead (notes, calls, stage changes, system events). */
const leadActivitySchema = new Schema(
  {
    leadId: { type: ObjectId, required: true },
    type: { type: String, enum: LEAD_ACTIVITY_TYPES, required: true },
    direction: { type: String, enum: [...ACTIVITY_DIRECTIONS, null], default: null },
    outcome: { type: String, enum: [...CALL_OUTCOMES, null], default: null },
    body: { type: String, default: null },
    data: { type: Schema.Types.Mixed, default: {} },
    actorType: { type: String, enum: ACTOR_TYPES, required: true },
    actorId: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: "leadActivities" },
);
leadActivitySchema.index({ leadId: 1, createdAt: -1 });

/**
 * A task on the board: a follow-up on a lead (leadId set) or any piece of sales work in a
 * project. `order` is the position inside its (project, status) column.
 */
const crmTaskSchema = new Schema(
  {
    projectId: { type: ObjectId, required: true },
    leadId: { type: ObjectId, default: null },
    assigneeId: { type: ObjectId, default: null },
    type: { type: String, enum: FOLLOWUP_TYPES, default: "CALL", required: true },
    priority: { type: String, enum: TASK_PRIORITIES, default: "MEDIUM", required: true },
    status: { type: String, enum: CRM_TASK_STATUSES, default: "TODO", required: true },
    order: { type: Number, default: 0 },
    title: { type: String, required: true },
    description: { type: String, default: null },
    dueAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    completedById: { type: ObjectId, default: null },
    createdById: { type: ObjectId, default: null },
    /** Set by automation (e.g. batch-urgency) so a job never creates the same task twice. */
    autoKey: { type: String, default: null },
  },
  { ...timestamps, collection: "crmTasks" },
);
crmTaskSchema.index({ projectId: 1, status: 1, order: 1 });
crmTaskSchema.index({ assigneeId: 1, status: 1, dueAt: 1 });
crmTaskSchema.index({ leadId: 1, status: 1, dueAt: 1 });
crmTaskSchema.index({ createdById: 1, status: 1 });
crmTaskSchema.index({ autoKey: 1 }, partialUnique("autoKey"));

const taskCommentSchema = new Schema(
  { taskId: { type: ObjectId, required: true }, body: { type: String, required: true }, authorId: { type: ObjectId, required: true } },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: "crmTaskComments" },
);
taskCommentSchema.index({ taskId: 1, createdAt: 1 });

/** Public ingest inbox (website form, later Meta lead ads): dedupe + audit trail + reprocessing state. */
const leadInboundEventSchema = new Schema(
  {
    source: { type: String, required: true },
    externalEventId: { type: String, required: true },
    signatureOk: { type: Boolean, required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    leadId: { type: ObjectId, default: null },
    receivedAt: { type: Date, default: () => new Date() },
    processingAt: { type: Date, default: null },
    processedAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    error: { type: String, default: null },
  },
  { versionKey: false, collection: "leadInboundEvents" },
);
leadInboundEventSchema.index({ source: 1, externalEventId: 1 }, { unique: true });
leadInboundEventSchema.index({ processedAt: 1, receivedAt: 1 });

/**
 * Something a lead can convert to: Inner Circle (broker account + deposit), the premium course,
 * the online clubs. Managed by CRM admins; never deleted (conversions point at it), only archived.
 * At most one product is the student course: becoming a student records a conversion to it.
 */
const crmProductSchema = new Schema(
  {
    name: { type: String, required: true },
    code: { type: String, required: true },
    description: { type: String, default: null },
    status: { type: String, enum: PRODUCT_STATUSES, default: "ACTIVE", required: true },
    isStudentCourse: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
    createdById: { type: ObjectId, default: null },
  },
  { ...timestamps, collection: "crmProducts" },
);
crmProductSchema.index({ code: 1 }, { unique: true });
crmProductSchema.index({ status: 1, sortOrder: 1, name: 1 });
crmProductSchema.index(
  { isStudentCourse: 1 },
  { unique: true, partialFilterExpression: { isStudentCourse: true }, name: "one_student_course" },
);

/**
 * A lead converting to a product (at most once per product). Credit goes to the lead owner at the
 * time (the person marking it when unassigned); `stageBefore` lets removing the last one reopen the lead.
 */
const leadConversionSchema = new Schema(
  {
    leadId: { type: ObjectId, required: true },
    productId: { type: ObjectId, required: true },
    projectId: { type: ObjectId, required: true },
    creditedToId: { type: ObjectId, default: null },
    convertedById: { type: ObjectId, default: null },
    source: { type: String, enum: CONVERSION_SOURCES, default: "MANUAL", required: true },
    stageBefore: { type: String, enum: [...LEAD_STAGES, null], default: null },
    note: { type: String, default: null },
    convertedAt: { type: Date, required: true },
  },
  { ...timestamps, collection: "leadConversions" },
);
leadConversionSchema.index({ leadId: 1, productId: 1 }, { unique: true });
leadConversionSchema.index({ creditedToId: 1, convertedAt: -1 });
leadConversionSchema.index({ productId: 1, convertedAt: -1 });
leadConversionSchema.index({ convertedAt: -1 });

/**
 * A deposit the lead made at the affiliate broker, logged by sales and verified by a commission
 * manager. A first deposit's commission is fixed when it is verified. Later deposits are rated by the
 * month: all verified later deposits credited to one person with a deposit date in one month earn the
 * slab rate their total reaches, re-rated whenever one of them is verified or rejected.
 */
const leadDepositSchema = new Schema(
  {
    leadId: { type: ObjectId, required: true },
    projectId: { type: ObjectId, required: true },
    creditedToId: { type: ObjectId, required: true },
    loggedById: { type: ObjectId, required: true },
    sequence: { type: String, enum: DEPOSIT_SEQUENCES, required: true },
    amountMinor: money(),
    currency: { type: String, default: "USD", required: true },
    depositedAt: { type: Date, required: true },
    jetaFxClientId: { type: String, default: null },
    reference: { type: String, default: null },
    note: { type: String, default: null },
    status: { type: String, enum: DEPOSIT_STATUSES, default: "PENDING", required: true },
    reviewedById: { type: ObjectId, default: null },
    reviewedAt: { type: Date, default: null },
    rejectReason: { type: String, default: null },
    commissionPct: { type: String, default: null },
    commissionMinor: { ...money(false), default: null },
    /** A verified later deposit: the month's later-deposit total its rate was picked by (null = not month-rated yet). */
    slabBaseMinor: { ...money(false), default: null },
  },
  { ...timestamps, collection: "leadDeposits" },
);
leadDepositSchema.index({ leadId: 1, depositedAt: -1 });
leadDepositSchema.index({ status: 1, createdAt: -1 });
leadDepositSchema.index({ creditedToId: 1, status: 1, depositedAt: -1 });
leadDepositSchema.index({ creditedToId: 1, sequence: 1, status: 1, depositedAt: 1 });

export const Project = model("Project", projectSchema);
export const Lead = model("Lead", leadSchema);
export const LeadActivity = model("LeadActivity", leadActivitySchema);
export const CrmTask = model("CrmTask", crmTaskSchema);
export const TaskComment = model("TaskComment", taskCommentSchema);
export const LeadInboundEvent = model("LeadInboundEvent", leadInboundEventSchema);
export const CrmProduct = model("CrmProduct", crmProductSchema);
export const LeadConversion = model("LeadConversion", leadConversionSchema);
export const LeadDeposit = model("LeadDeposit", leadDepositSchema);

export type ProjectDoc = InferSchemaType<typeof projectSchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
export type LeadDoc = InferSchemaType<typeof leadSchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
export type LeadActivityDoc = InferSchemaType<typeof leadActivitySchema> & { _id: Types.ObjectId; createdAt: Date };
export type CrmTaskDoc = InferSchemaType<typeof crmTaskSchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
export type TaskCommentDoc = InferSchemaType<typeof taskCommentSchema> & { _id: Types.ObjectId; createdAt: Date };
export type LeadInboundEventDoc = InferSchemaType<typeof leadInboundEventSchema> & { _id: Types.ObjectId };
export type CrmProductDoc = InferSchemaType<typeof crmProductSchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
export type LeadConversionDoc = InferSchemaType<typeof leadConversionSchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
export type LeadDepositDoc = InferSchemaType<typeof leadDepositSchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
