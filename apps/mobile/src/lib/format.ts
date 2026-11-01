import { ACADEMY_TZ, dubaiDateString, formatDateTime, formatTime, toDubaiLocal } from "@edge/domain/dates";

export { talkTime } from "@edge/domain/crm/machine";

/** "Today 14:30", or the date for anything else. The CRM runs on Dubai time wherever the phone is. */
export function dueLabel(iso: string) {
  const at = new Date(iso);
  return dubaiDateString(at) === dubaiDateString(new Date()) ? `Today ${formatTime(at)}` : formatDateTime(at);
}

export const isOverdue = (iso: string) => new Date(iso).getTime() < Date.now();

export function greeting() {
  const hour = Number(toDubaiLocal(new Date()).slice(11, 13));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

const longDate = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: ACADEMY_TZ });
export const todayLabel = () => longDate.format(new Date());

export function timeAgo(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  if (min < 1440) return `${Math.round(min / 60)}h ago`;
  return `${Math.round(min / 1440)}d ago`;
}

export interface FollowUpChoice {
  label: string;
  at: () => string;
}

const hoursFromNow = (h: number) => toDubaiLocal(new Date(Date.now() + h * 3_600_000));
/** 10:00 Dubai time, a set number of days from today. */
const morning = (days: number) => `${dubaiDateString(new Date(Date.now() + days * 86_400_000))}T10:00`;

export const FOLLOW_UP_CHOICES: FollowUpChoice[] = [
  { label: "In 2 hours", at: () => hoursFromNow(2) },
  { label: "Tomorrow", at: () => morning(1) },
  { label: "In 3 days", at: () => morning(3) },
];
