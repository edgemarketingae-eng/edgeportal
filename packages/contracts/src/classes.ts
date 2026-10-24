import { z } from "zod";
import { CACHE_STATES, CLASS_STATUSES, RECORDING_SOURCES, RECORDING_STATUSES } from "@edge/domain/enums";
import { paged, zOk, zPage } from "./common";
import { route } from "./route";

export const ClassSessionDto = z.object({
  id: z.string(),
  batchId: z.string(),
  batchName: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  startsAt: z.string(),
  endsAt: z.string(),
  status: z.enum(CLASS_STATUSES),
  hostId: z.string(),
  hostName: z.string(),
  openToAlumni: z.boolean(),
  isOwnBatch: z.boolean(),
  joinable: z.boolean(),
  manualJoinUrl: z.string().nullable(),
  meet: z.object({ hasLink: z.boolean(), autoRecord: z.boolean(), lastError: z.string().nullable() }),
  /** Published recordings (what students can open). */
  recordingIds: z.array(z.string()),
  /** Every recording of the class with its status (staff views only; students get the published ones). */
  recordings: z.array(z.object({ id: z.string(), status: z.enum(RECORDING_STATUSES) })),
  joins: z.number(),
});
export type ClassSessionDto = z.infer<typeof ClassSessionDto>;

export const RecordingDto = z.object({
  id: z.string(),
  batchId: z.string(),
  batchName: z.string(),
  classSessionId: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  source: z.enum(RECORDING_SOURCES),
  status: z.enum(RECORDING_STATUSES),
  recordedAt: z.string().nullable(),
  durationSec: z.number().nullable(),
  cacheState: z.enum(CACHE_STATES),
  lastError: z.string().nullable(),
  views: z.number(),
});
export type RecordingDto = z.infer<typeof RecordingDto>;

export const ScheduleClassInput = z.object({
  batchId: z.string().min(1, "Choose a batch"),
  title: z.string().trim().min(3, "Enter a title").max(150),
  description: z.string().trim().max(2000).optional(),
  date: z.iso.date("Choose a date"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Choose a start time"),
  durationMin: z.coerce.number().int().min(15).max(480),
  hostId: z.string().min(1, "Choose a host"),
  openToAlumni: z.boolean(),
  manualJoinUrl: z.union([z.literal(""), z.url()]).optional(),
  notify: z.boolean(),
});
export const RescheduleClassInput = ScheduleClassInput.pick({
  title: true,
  description: true,
  date: true,
  time: true,
  durationMin: true,
  manualJoinUrl: true,
  notify: true,
});

export const AddRecordingInput = z.object({
  batchId: z.string().min(1, "Choose a batch"),
  classSessionId: z.string().optional(),
  driveUrl: z.string().trim().min(10, "Paste a Google Drive file link"),
  title: z.string().trim().min(3, "Enter a title"),
  description: z.string().trim().optional(),
  publish: z.boolean(),
});

const idParam = z.object({ id: z.string() });
const option = z.object({ id: z.string(), name: z.string() });

export const classRoutes = {
  studentClasses: route({
    method: "GET",
    path: "/api/v1/student/classes",
    response: z.object({ upcoming: z.array(ClassSessionDto), past: z.array(ClassSessionDto), joinWindowMinutes: z.number() }),
  }),
  studentRecordings: route({ method: "GET", path: "/api/v1/student/recordings", response: z.array(RecordingDto) }),
  watch: route({
    method: "GET",
    path: "/api/v1/student/recordings/:id/watch",
    params: idParam,
    response: z.object({ recording: RecordingDto, src: z.string(), watermark: z.string() }),
  }),
  staffOverview: route({
    method: "GET",
    path: "/api/v1/staff/overview",
    response: z.object({
      scopeAll: z.boolean(),
      batches: z.array(z.object({ id: z.string(), name: z.string(), startDate: z.string(), activeStudents: z.number() })),
      upcoming: z.array(ClassSessionDto),
    }),
  }),
  manageClasses: route({
    method: "GET",
    path: "/api/v1/staff/classes",
    query: zPage,
    response: z.object({
      batches: z.array(option),
      hosts: z.array(option),
      defaultHostId: z.string().nullable(),
      upcoming: z.array(ClassSessionDto),
      past: paged(ClassSessionDto),
    }),
  }),
  schedule: route({
    method: "POST",
    path: "/api/v1/staff/classes",
    body: ScheduleClassInput,
    response: z.object({ id: z.string(), warning: z.string().nullable(), notified: z.number() }),
  }),
  reschedule: route({ method: "POST", path: "/api/v1/staff/classes/:id", params: idParam, body: RescheduleClassInput, response: zOk }),
  cancel: route({
    method: "POST",
    path: "/api/v1/staff/classes/:id/cancel",
    params: idParam,
    body: z.object({ reason: z.string().trim().default(""), notify: z.boolean().default(true) }),
    response: zOk,
  }),
  manageRecordings: route({
    method: "GET",
    path: "/api/v1/staff/recordings",
    query: zPage,
    response: z.object({
      batches: z.array(option),
      sessions: z.array(z.object({ id: z.string(), batchId: z.string(), label: z.string() })),
      recordings: paged(RecordingDto),
    }),
  }),
  addRecording: route({
    method: "POST",
    path: "/api/v1/staff/recordings",
    body: AddRecordingInput,
    response: z.object({ id: z.string() }),
  }),
  setRecordingStatus: route({
    method: "POST",
    path: "/api/v1/staff/recordings/:id/status",
    params: idParam,
    body: z.object({ status: z.enum(["PUBLISHED", "HIDDEN"]) }),
    response: zOk,
  }),
};
