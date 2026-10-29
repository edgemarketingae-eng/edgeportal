import { Badge } from "../components/badge";
import { tone, type Tone } from "../lib/tones";

const TONES: Record<string, Tone> = {
  SUCCEEDED: "success",
  PENDING: "warning",
  CREATED: "neutral",
  AUTHORIZED: "warning",
  FAILED: "danger",
  CANCELLED: "gray",
  EXPIRED: "gray",
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
    <Badge variant="outline" className={TONES[status] ? tone[TONES[status]] : undefined}>
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
