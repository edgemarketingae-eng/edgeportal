import type { LeadDepositDto } from "@edge/contracts";
import { DEPOSIT_SEQUENCE_LABELS } from "@edge/domain/crm/labels";
import { ACADEMY_TZ, dubaiDateString, formatDate, formatDateTime, formatTime, toDubaiLocal } from "@edge/domain/dates";
import { formatMoney } from "@edge/domain/money";

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

export const tomorrowMorning = () => morning(1);

/** Where a task sits in the list. */
export function taskGroup(dueAt: string | null) {
  if (!dueAt) return "No date";
  if (isOverdue(dueAt)) return "Overdue";
  return dubaiDateString(new Date(dueAt)) === dubaiDateString(new Date()) ? "Today" : "Upcoming";
}

const hoursFromNow = (h: number) => toDubaiLocal(new Date(Date.now() + h * 3_600_000));
/** 10:00 Dubai time, a set number of days from today. */
const morning = (days: number) => `${dubaiDateString(new Date(Date.now() + days * 86_400_000))}T10:00`;

export const FOLLOW_UP_CHOICES: FollowUpChoice[] = [
  { label: "In 2 hours", at: () => hoursFromNow(2) },
  { label: "Tomorrow", at: () => morning(1) },
  { label: "In 3 days", at: () => morning(3) },
];

const monthName = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/** The same words the web CRM uses before verifying, because this decides commission. */
export function verifyPrompt(d: LeadDepositDto) {
  const what = `${d.lead.name}: ${DEPOSIT_SEQUENCE_LABELS[d.sequence].toLowerCase()} of ${formatMoney(d.amountMinor, d.currency)} on ${formatDate(d.depositedAt)}`;
  const effect =
    d.sequence === "FIRST"
      ? "The commission is fixed with today's first-deposit rate."
      : `It joins the ${monthName.format(new Date(`${d.depositedAt.slice(0, 7)}-01T00:00:00.000Z`))} later deposits of the person it counts for: all of them earn the slab rate their total reaches, so their commission is recalculated.`;
  return `${what}, JetaFX client ${d.jetaFxClientId ?? "unknown"}. Check it against the JetaFX report. ${effect}`;
}
