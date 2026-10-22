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

export function SyncBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={SYNC[status]}>
      Odoo: {status.toLowerCase().replace("_", " ")}
    </Badge>
  );
}
