import { Badge } from "../components/badge";

const STYLES: Record<string, string> = {
  SUCCEEDED: "bg-edge-green/20 text-edge-emerald border-edge-green/40",
  PENDING: "bg-amber-50 text-amber-800 border-amber-300",
  CREATED: "bg-muted text-muted-foreground",
  AUTHORIZED: "bg-amber-50 text-amber-800 border-amber-300",
  FAILED: "bg-destructive/10 text-destructive border-destructive/30",
  CANCELLED: "bg-muted text-muted-foreground",
  EXPIRED: "bg-muted text-muted-foreground",
};

const LABELS: Record<string, string> = {
  SUCCEEDED: "Paid",
  PENDING: "Pending",
  CREATED: "Started",
  AUTHORIZED: "Authorised",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};

export function PaymentStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={STYLES[status]}>
      {LABELS[status] ?? status}
    </Badge>
  );
}

export const KIND_LABELS: Record<string, string> = { FULL: "Full payment", ADVANCE: "Advance", BALANCE: "Balance", MANUAL: "Manual" };
export const GATEWAY_LABELS: Record<string, string> = {
  STRIPE: "Card (Stripe)",
  NOMOD: "Card (Nomod)",
  TABBY: "Tabby",
  TAMARA: "Tamara",
  MANUAL: "Bank / cash",
  MOCK: "Test gateway",
};
