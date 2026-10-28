import { DEPOSIT_STATUS_LABELS, LEAD_STAGE_LABELS, LEAD_TEMPERATURE_LABELS } from "@edge/domain/crm/labels";
import { Badge } from "../components/badge";

const ENROLLMENT: Record<string, { label: string; className: string }> = {
  PENDING_PAYMENT: { label: "Awaiting payment", className: "bg-muted text-muted-foreground" },
  PENDING_APPROVAL: { label: "Needs approval", className: "bg-amber-50 text-amber-800 border-amber-300" },
  ACTIVE: { label: "Active", className: "bg-edge-green/20 text-edge-emerald border-edge-green/40" },
  LOCKED: { label: "Locked", className: "bg-destructive/10 text-destructive border-destructive/30" },
  REJECTED: { label: "Rejected", className: "bg-destructive/10 text-destructive border-destructive/30" },
  CANCELLED: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
};

const PAYMENT_STATE: Record<string, { label: string; className: string }> = {
  UNPAID: { label: "Unpaid", className: "bg-muted text-muted-foreground" },
  PARTIALLY_PAID: { label: "Advance paid", className: "bg-amber-50 text-amber-800 border-amber-300" },
  PAID: { label: "Fully paid", className: "bg-edge-green/20 text-edge-emerald border-edge-green/40" },
};

export function EnrollmentBadge({ status, lockReason }: { status: string; lockReason?: string | null }) {
  const s = ENROLLMENT[status] ?? { label: status, className: "" };
  return (
    <Badge variant="outline" className={s.className}>
      {s.label}
      {status === "LOCKED" && lockReason ? ` (${lockReason === "MANUAL" ? "manual" : "overdue"})` : ""}
    </Badge>
  );
}

export function PaymentStateBadge({ state }: { state: string }) {
  const s = PAYMENT_STATE[state] ?? { label: state, className: "" };
  return (
    <Badge variant="outline" className={s.className}>
      {s.label}
    </Badge>
  );
}

const SYNC: Record<string, string> = {
  PENDING: "bg-muted text-muted-foreground",
  IN_PROGRESS: "bg-amber-50 text-amber-800 border-amber-300",
  SYNCED: "bg-edge-green/20 text-edge-emerald border-edge-green/40",
  FAILED: "bg-destructive/10 text-destructive border-destructive/30",
  SKIPPED: "bg-muted text-muted-foreground",
};

const LEAD_STAGE: Record<string, string> = {
  NEW: "bg-sky-50 text-sky-800 border-sky-300",
  CONTACTED: "bg-muted text-muted-foreground",
  QUALIFIED: "bg-edge-mint/40 text-edge-emerald border-edge-green/40",
  CONSULTATION: "bg-violet-50 text-violet-800 border-violet-300",
  NEGOTIATION: "bg-amber-50 text-amber-800 border-amber-300",
  CONVERTED: "bg-edge-green/20 text-edge-emerald border-edge-green/40",
  LOST: "bg-destructive/10 text-destructive border-destructive/30",
};

export function LeadStageBadge({ stage }: { stage: string }) {
  return (
    <Badge variant="outline" className={LEAD_STAGE[stage] ?? ""}>
      {(LEAD_STAGE_LABELS as Record<string, string>)[stage] ?? stage}
    </Badge>
  );
}

const TEMPERATURE: Record<string, string> = {
  HOT: "bg-edge-coral/20 text-red-700 border-edge-coral/60",
  WARM: "bg-amber-50 text-amber-800 border-amber-300",
  COLD: "bg-sky-50 text-sky-800 border-sky-300",
};

export function TemperatureBadge({ temperature }: { temperature: string }) {
  return (
    <Badge variant="outline" className={TEMPERATURE[temperature] ?? ""}>
      {(LEAD_TEMPERATURE_LABELS as Record<string, string>)[temperature] ?? temperature}
    </Badge>
  );
}

const DEPOSIT: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-800 border-amber-300",
  VERIFIED: "bg-edge-green/20 text-edge-emerald border-edge-green/40",
  REJECTED: "bg-destructive/10 text-destructive border-destructive/30",
};

export function DepositStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={DEPOSIT[status] ?? ""}>
      {(DEPOSIT_STATUS_LABELS as Record<string, string>)[status] ?? status}
    </Badge>
  );
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
  return (
    <Badge variant="outline" className={SYNC[status]}>
      Odoo: {status.toLowerCase().replace("_", " ")}
    </Badge>
  );
}
