/** CRM enum values (also used as Mongoose enums and Zod enums). */
export const LEAD_STAGES = ["NEW", "CONTACTED", "QUALIFIED", "CONSULTATION", "NEGOTIATION", "CONVERTED", "LOST"] as const;
export const OPEN_LEAD_STAGES = ["NEW", "CONTACTED", "QUALIFIED", "CONSULTATION", "NEGOTIATION"] as const;
export const LEAD_SOURCES = [
  "WEBSITE",
  "INSTAGRAM",
  "META_ADS",
  "GOOGLE_ADS",
  "YOUTUBE",
  "TIKTOK",
  "WHATSAPP",
  "REFERRAL",
  "WALK_IN",
  "PHONE_IN",
  "WEBINAR",
  "EVENT",
  "IMPORT",
  "OTHER",
] as const;
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
  "PRODUCT_CONVERTED",
  "CONVERSION_REMOVED",
  "DEPOSIT_LOGGED",
  "DEPOSIT_VERIFIED",
  "DEPOSIT_REJECTED",
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
export const LEAD_LANGUAGES = ["MALAYALAM", "TAMIL", "ENGLISH", "HINDI", "OTHER"] as const;
/** Products a lead can convert to (Inner Circle, the premium course, clubs); managed in the CRM. */
export const PRODUCT_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
/** MANUAL = marked by staff; STUDENT = recorded when the lead became a student (the student-course product). */
export const CONVERSION_SOURCES = ["MANUAL", "STUDENT"] as const;
/** Broker deposits logged on a lead; each sequence has its own commission rate. */
export const DEPOSIT_SEQUENCES = ["FIRST", "SECOND", "LATER"] as const;
export const DEPOSIT_STATUSES = ["PENDING", "VERIFIED", "REJECTED"] as const;
/** Broker deposits are in US dollars. */
export const DEPOSIT_CURRENCY = "USD";
export const LEADERBOARD_PERIODS = ["month", "lastMonth", "quarter", "year", "all"] as const;
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
export type LeadLanguage = (typeof LEAD_LANGUAGES)[number];
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export type ConversionSource = (typeof CONVERSION_SOURCES)[number];
export type DepositSequence = (typeof DEPOSIT_SEQUENCES)[number];
export type DepositStatus = (typeof DEPOSIT_STATUSES)[number];
export type LeaderboardPeriod = (typeof LEADERBOARD_PERIODS)[number];
export type InboundSource = (typeof INBOUND_SOURCES)[number];

/** Owner value meaning "spread across the project's sales executives" (bulk assign, import). */
export const ROUND_ROBIN = "ROUND_ROBIN";
