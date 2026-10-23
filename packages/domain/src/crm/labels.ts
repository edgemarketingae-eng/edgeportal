import type { CallOutcome, CrmTaskStatus, ExperienceLevel, FollowUpType, LeadActivityType, LeadChannel, LeadSource, LeadStage, LeadTemperature, ProjectStatus, TaskPriority } from "./enums";

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

export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = { NONE: "No trading experience", BEGINNER: "Beginner", INTERMEDIATE: "Intermediate", ADVANCED: "Advanced" };

export const CALL_OUTCOME_LABELS: Record<CallOutcome, string> = {
  ANSWERED: "Answered",
  NO_ANSWER: "No answer",
  BUSY: "Busy",
  WRONG_NUMBER: "Wrong number",
  CALLBACK: "Asked to call back",
};

export const FOLLOWUP_TYPE_LABELS: Record<FollowUpType, string> = { CALL: "Call", WHATSAPP: "WhatsApp", EMAIL: "Email", MEETING: "Meeting", OTHER: "Other" };

export const TASK_STATUS_LABELS: Record<CrmTaskStatus, string> = { TODO: "To do", IN_PROGRESS: "In progress", WAITING: "Waiting", DONE: "Done", CANCELLED: "Cancelled" };

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
};
