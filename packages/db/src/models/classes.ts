import { CACHE_STATES, CLASS_STATUSES, RECORDING_SOURCES, RECORDING_STATUSES } from "@edge/domain/enums";
import { Schema, model, type InferSchemaType, type Types } from "mongoose";
import { ObjectId, partialUnique, timestamps } from "./shared";

/** A Google Calendar event with a Meet conference (reused later by mentorship and webinars). */
const meetEventSchema = new Schema(
  {
    organizerEmail: { type: String, required: true },
    calendarId: { type: String, default: "primary" },
    calendarEventId: { type: String, required: true },
    meetSpaceName: { type: String, default: null },
    meetingCode: { type: String, default: null },
    joinUrl: { type: String, default: null },
    accessType: { type: String, default: null },
    autoRecord: { type: Boolean, default: false },
    configSyncedAt: { type: Date, default: null },
    lastError: { type: String, default: null },
  },
  { ...timestamps, collection: "meetEvents" },
);
meetEventSchema.index({ calendarEventId: 1 }, { unique: true });
meetEventSchema.index({ meetSpaceName: 1 }, partialUnique("meetSpaceName"));

const classSessionSchema = new Schema(
  {
    batchId: { type: ObjectId, required: true },
    title: { type: String, required: true },
    description: { type: String, default: null },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    hostId: { type: ObjectId, required: true },
    status: { type: String, enum: CLASS_STATUSES, default: "SCHEDULED", required: true },
    openToAlumni: { type: Boolean, default: true },
    meetEventId: { type: ObjectId, default: null },
    manualJoinUrl: { type: String, default: null },
    createdById: { type: ObjectId, required: true },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: null },
  },
  { ...timestamps, collection: "classSessions" },
);
classSessionSchema.index({ startsAt: 1 });
classSessionSchema.index({ batchId: 1, startsAt: 1 });
classSessionSchema.index({ meetEventId: 1 }, partialUnique("meetEventId", "objectId"));

const cacheSchema = new Schema(
  {
    state: { type: String, enum: CACHE_STATES, default: "NONE" },
    path: { type: String, default: null },
    cachedAt: { type: Date, default: null },
    lastServedAt: { type: Date, default: null },
    claimedAt: { type: Date, default: null },
  },
  { _id: false },
);

const recordingSchema = new Schema(
  {
    batchId: { type: ObjectId, required: true },
    classSessionId: { type: ObjectId, default: null },
    title: { type: String, required: true },
    description: { type: String, default: null },
    source: { type: String, enum: RECORDING_SOURCES, required: true },
    status: { type: String, enum: RECORDING_STATUSES, default: "DISCOVERED", required: true },
    driveFileId: { type: String, required: true },
    driveAccessEmail: { type: String, default: null },
    mimeType: { type: String, default: null },
    sizeBytes: { type: Number, default: null },
    durationSec: { type: Number, default: null },
    meetRecordingName: { type: String, default: null },
    recordedAt: { type: Date, default: null },
    publishedAt: { type: Date, default: null },
    sortOrder: { type: Number, default: 0 },
    cache: { type: cacheSchema, default: () => ({}) },
    lastError: { type: String, default: null },
  },
  { ...timestamps, collection: "recordings" },
);
recordingSchema.index({ driveFileId: 1 }, { unique: true });
recordingSchema.index({ meetRecordingName: 1 }, partialUnique("meetRecordingName"));
recordingSchema.index({ batchId: 1, status: 1 });

const joinLogSchema = new Schema(
  { classSessionId: { type: ObjectId, required: true }, userId: { type: ObjectId, required: true }, at: { type: Date, default: () => new Date() }, ip: { type: String, default: null } },
  { versionKey: false, collection: "joinLogs" },
);
joinLogSchema.index({ classSessionId: 1 });

const recordingViewSchema = new Schema(
  {
    recordingId: { type: ObjectId, required: true },
    userId: { type: ObjectId, required: true },
    startedAt: { type: Date, default: () => new Date() },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { versionKey: false, collection: "recordingViews" },
);
recordingViewSchema.index({ recordingId: 1 });
recordingViewSchema.index({ userId: 1 });

export const MeetEvent = model("MeetEvent", meetEventSchema);
export const ClassSession = model("ClassSession", classSessionSchema);
export const Recording = model("Recording", recordingSchema);
export const JoinLog = model("JoinLog", joinLogSchema);
export const RecordingView = model("RecordingView", recordingViewSchema);

export type MeetEventDoc = InferSchemaType<typeof meetEventSchema> & { _id: Types.ObjectId };
export type ClassSessionDoc = InferSchemaType<typeof classSessionSchema> & { _id: Types.ObjectId };
export type RecordingDoc = InferSchemaType<typeof recordingSchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
