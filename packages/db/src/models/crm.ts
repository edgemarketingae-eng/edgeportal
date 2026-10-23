import {
  ACTIVITY_DIRECTIONS,
  CALL_OUTCOMES,
  CRM_TASK_STATUSES,
  EXPERIENCE_LEVELS,
  FOLLOWUP_TYPES,
  LEAD_ACTIVITY_TYPES,
  LEAD_CHANNELS,
  LEAD_SOURCES,
  LEAD_STAGES,
  LEAD_TEMPERATURES,
  PROJECT_STATUSES,
  TASK_PRIORITIES,
} from "@edge/domain/crm/enums";
import { ACTOR_TYPES } from "@edge/domain/enums";
import { Schema, model, type InferSchemaType, type Types } from "mongoose";
import { ObjectId, partialUnique, timestamps } from "./shared";

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
    country: { type: String, default: "AE" },
    language: { type: String, default: null },
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

export const Project = model("Project", projectSchema);
export const Lead = model("Lead", leadSchema);
export const LeadActivity = model("LeadActivity", leadActivitySchema);
export const CrmTask = model("CrmTask", crmTaskSchema);
export const TaskComment = model("TaskComment", taskCommentSchema);
export const LeadInboundEvent = model("LeadInboundEvent", leadInboundEventSchema);

export type ProjectDoc = InferSchemaType<typeof projectSchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
export type LeadDoc = InferSchemaType<typeof leadSchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
export type LeadActivityDoc = InferSchemaType<typeof leadActivitySchema> & { _id: Types.ObjectId; createdAt: Date };
export type CrmTaskDoc = InferSchemaType<typeof crmTaskSchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
export type TaskCommentDoc = InferSchemaType<typeof taskCommentSchema> & { _id: Types.ObjectId; createdAt: Date };
export type LeadInboundEventDoc = InferSchemaType<typeof leadInboundEventSchema> & { _id: Types.ObjectId };
