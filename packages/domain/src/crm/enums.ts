/** CRM enum values (also used as Mongoose enums and Zod enums). */
export const LEAD_STAGES = ["NEW", "CONTACTED", "QUALIFIED", "CONSULTATION", "NEGOTIATION", "CONVERTED", "LOST"] as const;
export const OPEN_LEAD_STAGES = ["NEW", "CONTACTED", "QUALIFIED", "CONSULTATION", "NEGOTIATION"] as const;
export const LEAD_SOURCES = ["WEBSITE", "INSTAGRAM", "META_ADS", "GOOGLE_ADS", "YOUTUBE", "TIKTOK", "WHATSAPP", "REFERRAL", "WALK_IN", "PHONE_IN", "WEBINAR", "EVENT", "IMPORT", "OTHER"] as const;
export const LEAD_TEMPERATURES = ["HOT", "WARM", "COLD"] as const;
export const LEAD_CHANNELS = ["WHATSAPP", "CALL", "EMAIL", "SMS"] as const;
/** Activities staff log by hand. */
export const LEAD_TOUCH_TYPES = ["NOTE", "CALL", "WHATSAPP", "EMAIL", "MEETING"] as const;
/** Touches that count as contacting the lead (first-response SLA, auto NEW -> CONTACTED). */
export const LEAD_CONTACT_TYPES = ["CALL", "WHATSAPP", "EMAIL", "MEETING"] as const;
export const LEAD_ACTIVITY_TYPES = [
  ...LEAD_TOUCH_TYPES,
  "CREATED",
  "STAGE_CHANGED",
  "ASSIGNED",
  "CLAIMED",
  "PROJECT_CHANGED",
  "TASK_CREATED",
  "TASK_DONE",
  "TASK_CANCELLED",
  "INBOUND",
  "CONVERTED",
  "LINKED",
  "MERGED",
  "IMPORTED",
  "SYSTEM",
] as const;
export const CALL_OUTCOMES = ["ANSWERED", "NO_ANSWER", "BUSY", "WRONG_NUMBER", "CALLBACK"] as const;
export const ACTIVITY_DIRECTIONS = ["IN", "OUT"] as const;
export const FOLLOWUP_TYPES = ["CALL", "WHATSAPP", "EMAIL", "MEETING", "OTHER"] as const;
/** Board columns; DONE and CANCELLED are closed. */
export const CRM_TASK_STATUSES = ["TODO", "IN_PROGRESS", "WAITING", "DONE", "CANCELLED"] as const;
export const OPEN_TASK_STATUSES = ["TODO", "IN_PROGRESS", "WAITING"] as const;
export const CLOSED_TASK_STATUSES = ["DONE", "CANCELLED"] as const;
export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const PROJECT_STATUSES = ["ACTIVE", "PAUSED", "ARCHIVED"] as const;
export const EXPERIENCE_LEVELS = ["NONE", "BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
/** Public ingest endpoints: POST /api/webhooks/leads/:source */
export const INBOUND_SOURCES = ["website"] as const;

export type LeadStage = (typeof LEAD_STAGES)[number];
export type OpenLeadStage = (typeof OPEN_LEAD_STAGES)[number];
export type LeadSource = (typeof LEAD_SOURCES)[number];
export type LeadTemperature = (typeof LEAD_TEMPERATURES)[number];
export type LeadChannel = (typeof LEAD_CHANNELS)[number];
export type LeadTouchType = (typeof LEAD_TOUCH_TYPES)[number];
export type LeadActivityType = (typeof LEAD_ACTIVITY_TYPES)[number];
export type CallOutcome = (typeof CALL_OUTCOMES)[number];
export type FollowUpType = (typeof FOLLOWUP_TYPES)[number];
export type CrmTaskStatus = (typeof CRM_TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];
export type InboundSource = (typeof INBOUND_SOURCES)[number];
