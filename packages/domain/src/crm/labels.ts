import type {
  CallOutcome,
  CrmTaskStatus,
  DepositSequence,
  DepositStatus,
  ExperienceLevel,
  FollowUpType,
  LeadActivityType,
  LeadChannel,
  LeaderboardPeriod,
  LeadLanguage,
  LeadSource,
  LeadStage,
  LeadTemperature,
  ProductStatus,
  ProjectStatus,
  TaskPriority,
} from "./enums";

/** Human labels shared by the console, emails and CSV exports. */
export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  CONSULTATION: "Consultation",
  NEGOTIATION: "Negotiation",
  CONVERTED: "Converted",
  LOST: "Lost",
};

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  WEBSITE: "Website",
  INSTAGRAM: "Instagram",
  META_ADS: "Meta ads",
  GOOGLE_ADS: "Google ads",
  YOUTUBE: "YouTube",
  TIKTOK: "TikTok",
  WHATSAPP: "WhatsApp",
  REFERRAL: "Referral",
  WALK_IN: "Walk-in",
  PHONE_IN: "Phone enquiry",
  WEBINAR: "Webinar",
  EVENT: "Event",
  IMPORT: "Import",
  OTHER: "Other",
};

export const LEAD_TEMPERATURE_LABELS: Record<LeadTemperature, string> = { HOT: "Hot", WARM: "Warm", COLD: "Cold" };

export const LEAD_CHANNEL_LABELS: Record<LeadChannel, string> = { WHATSAPP: "WhatsApp", CALL: "Phone call", EMAIL: "Email", SMS: "SMS" };

export const LANGUAGE_LABELS: Record<LeadLanguage, string> = {
  MALAYALAM: "Malayalam",
  TAMIL: "Tamil",
  ENGLISH: "English",
  HINDI: "Hindi",
  OTHER: "Other",
};

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = { ACTIVE: "Active", ARCHIVED: "Archived" };

export const DEPOSIT_SEQUENCE_LABELS: Record<DepositSequence, string> = {
  FIRST: "1st deposit",
  SECOND: "2nd deposit",
  LATER: "Later deposit",
};

export const DEPOSIT_STATUS_LABELS: Record<DepositStatus, string> = { PENDING: "Pending", VERIFIED: "Verified", REJECTED: "Rejected" };

export const LEADERBOARD_PERIOD_LABELS: Record<LeaderboardPeriod, string> = {
  month: "This month",
  lastMonth: "Last month",
  quarter: "This quarter",
  year: "This year",
  all: "All time",
};

/** The three questions sales asks every lead (answers are free text on the lead). */
export const QUALIFICATION_QUESTIONS = {
  experience: "Trading experience and capital",
  occupation: "Job and salary or business, and any debts",
  purpose: "Purpose of learning trading",
} as const;
export type QualificationKey = keyof typeof QUALIFICATION_QUESTIONS;

export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  NONE: "No trading experience",
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
};

export const CALL_OUTCOME_LABELS: Record<CallOutcome, string> = {
  ANSWERED: "Answered",
  NO_ANSWER: "No answer",
  BUSY: "Busy",
  WRONG_NUMBER: "Wrong number",
  CALLBACK: "Asked to call back",
};

export const FOLLOWUP_TYPE_LABELS: Record<FollowUpType, string> = {
  CALL: "Call",
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  MEETING: "Meeting",
  OTHER: "Other",
};

export const TASK_STATUS_LABELS: Record<CrmTaskStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  WAITING: "Waiting",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", URGENT: "Urgent" };

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = { ACTIVE: "Active", PAUSED: "Paused", ARCHIVED: "Archived" };

export const ACTIVITY_LABELS: Record<LeadActivityType, string> = {
  NOTE: "Note",
  CALL: "Call",
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  MEETING: "Meeting",
  CREATED: "Lead created",
  STAGE_CHANGED: "Stage changed",
  ASSIGNED: "Assigned",
  CLAIMED: "Claimed",
  PROJECT_CHANGED: "Moved to another project",
  TASK_CREATED: "Follow-up scheduled",
  TASK_DONE: "Follow-up done",
  TASK_CANCELLED: "Follow-up cancelled",
  INBOUND: "Enquired again",
  CONVERTED: "Converted to student",
  LINKED: "Linked to student",
  MERGED: "Merged",
  IMPORTED: "Imported",
  SYSTEM: "System",
  PRODUCT_CONVERTED: "Converted",
  CONVERSION_REMOVED: "Conversion removed",
  DEPOSIT_LOGGED: "Deposit logged",
  DEPOSIT_VERIFIED: "Deposit verified",
  DEPOSIT_REJECTED: "Deposit rejected",
};
