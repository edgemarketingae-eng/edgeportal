import {
  DEPOSIT_STATUS_LABELS,
  LEAD_STAGE_LABELS,
  LEAD_TEMPERATURE_LABELS,
  PROJECT_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
} from "@edge/domain/crm/labels";
import { Flame, Snowflake, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "../components/badge";
import { tone, type Tone } from "../lib/tones";

/** An outline badge in a tone, for a value looked up in a table of tones and labels. */
function ToneBadge({
  value,
  tones,
  labels,
  children,
}: {
  value: string;
  tones: Record<string, Tone>;
  labels?: Record<string, string>;
  children?: ReactNode;
}) {
  const t = tones[value];
  return (
    <Badge variant="outline" className={t ? tone[t] : undefined}>
      {children}
      {labels?.[value] ?? value}
    </Badge>
  );
}

const ENROLLMENT: Record<string, { label: string; tone: Tone }> = {
  PENDING_PAYMENT: { label: "Awaiting payment", tone: "neutral" },
  PENDING_APPROVAL: { label: "Needs approval", tone: "warning" },
  ACTIVE: { label: "Active", tone: "success" },
  LOCKED: { label: "Locked", tone: "danger" },
  REJECTED: { label: "Rejected", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "gray" },
};

const PAYMENT_STATE: Record<string, { label: string; tone: Tone }> = {
  UNPAID: { label: "Unpaid", tone: "neutral" },
  PARTIALLY_PAID: { label: "Advance paid", tone: "warning" },
  PAID: { label: "Fully paid", tone: "success" },
};

export function EnrollmentBadge({ status, lockReason }: { status: string; lockReason?: string | null }) {
  const s = ENROLLMENT[status];
  return (
    <Badge variant="outline" className={s ? tone[s.tone] : undefined}>
      {s?.label ?? status}
      {status === "LOCKED" && lockReason ? ` (${lockReason === "MANUAL" ? "manual" : "overdue"})` : ""}
    </Badge>
  );
}

export function PaymentStateBadge({ state }: { state: string }) {
  const s = PAYMENT_STATE[state];
  return (
    <Badge variant="outline" className={s ? tone[s.tone] : undefined}>
      {s?.label ?? state}
    </Badge>
  );
}

const SYNC: Record<string, Tone> = { PENDING: "neutral", IN_PROGRESS: "warning", SYNCED: "success", FAILED: "danger", SKIPPED: "gray" };

/** Every stage its own colour, in funnel order from blue to green; Lost is grey (closed), never red like Hot. */
const LEAD_STAGE: Record<string, Tone> = {
  NEW: "blue",
  CONTACTED: "indigo",
  QUALIFIED: "teal",
  CONSULTATION: "violet",
  NEGOTIATION: "orange",
  CONVERTED: "success",
  LOST: "gray",
};

export function LeadStageBadge({ stage }: { stage: string }) {
  return <ToneBadge value={stage} tones={LEAD_STAGE} labels={LEAD_STAGE_LABELS} />;
}

const TEMPERATURE: Record<string, Tone> = { HOT: "red", WARM: "warning", COLD: "sky" };
const TEMPERATURE_ICON: Record<string, ReactNode> = {
  HOT: <Flame aria-hidden />,
  WARM: <Sun aria-hidden />,
  COLD: <Snowflake aria-hidden />,
};

/** With an icon, so it never reads as a stage badge beside it. */
export function TemperatureBadge({ temperature }: { temperature: string }) {
  return (
    <ToneBadge value={temperature} tones={TEMPERATURE} labels={LEAD_TEMPERATURE_LABELS}>
      {TEMPERATURE_ICON[temperature]}
    </ToneBadge>
  );
}

const DEPOSIT: Record<string, Tone> = { PENDING: "warning", VERIFIED: "success", REJECTED: "danger" };

export function DepositStatusBadge({ status }: { status: string }) {
  return <ToneBadge value={status} tones={DEPOSIT} labels={DEPOSIT_STATUS_LABELS} />;
}

const TASK_STATUS: Record<string, Tone> = { TODO: "blue", IN_PROGRESS: "indigo", WAITING: "warning", DONE: "success", CANCELLED: "gray" };

export function TaskStatusBadge({ status }: { status: string }) {
  return <ToneBadge value={status} tones={TASK_STATUS} labels={TASK_STATUS_LABELS} />;
}

const TASK_PRIORITY: Record<string, Tone> = { LOW: "gray", MEDIUM: "sky", HIGH: "orange", URGENT: "red" };

export function TaskPriorityBadge({ priority }: { priority: string }) {
  return <ToneBadge value={priority} tones={TASK_PRIORITY} labels={TASK_PRIORITY_LABELS} />;
}

const PROJECT_STATUS: Record<string, Tone> = { ACTIVE: "success", PAUSED: "warning", ARCHIVED: "gray" };

export function ProjectStatusBadge({ status }: { status: string }) {
  return <ToneBadge value={status} tones={PROJECT_STATUS} labels={PROJECT_STATUS_LABELS} />;
}

/** A product the lead converted to (Inner Circle, a club…). */
export function ProductBadge({ name }: { name: string }) {
  return (
    <Badge variant="outline" className="border-edge-green/40 text-edge-emerald">
      {name}
    </Badge>
  );
}

export function SyncBadge({ status }: { status: string }) {
  const t = SYNC[status];
  return (
    <Badge variant="outline" className={t ? tone[t] : undefined}>
      Odoo: {status.toLowerCase().replace("_", " ")}
    </Badge>
  );
}
