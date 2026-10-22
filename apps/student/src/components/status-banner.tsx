import type { PortalDto } from "@edge/contracts";
import { formatDate } from "@edge/domain/dates";
import { formatMoney } from "@edge/domain/money";
import { Button } from "@edge/ui/components/button";
import { AlertTriangle, Clock, Hourglass, Lock, XCircle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

function Shell({ tone, icon, title, children, action }: { tone: "info" | "warn" | "danger"; icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  const tones = {
    info: "border-edge-emerald/30 bg-edge-mint/40",
    warn: "border-amber-500/40 bg-amber-50",
    danger: "border-destructive/40 bg-destructive/5",
  } as const;
  return (
    <div className={`mb-6 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center ${tones[tone]}`}>
      <div className="flex flex-1 gap-3">
        <span className="mt-0.5 [&_svg]:size-5">{icon}</span>
        <div>
          <p className="font-semibold">{title}</p>
          {children ? <div className="text-muted-foreground mt-0.5 text-sm">{children}</div> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

export function StatusBanner({ portal }: { portal: PortalDto }) {
  const { entitlements: ent, enrollment: e, supportEmail } = portal;
  switch (ent.banner) {
    case "NO_BATCH":
      return (
        <Shell tone="info" icon={<Clock className="text-edge-emerald" />} title="No batch is open for enrollment right now">
          We will email you as soon as the next batch opens. You can also contact {supportEmail}.
        </Shell>
      );
    case "PENDING_PAYMENT":
      return (
        <Shell
          tone="info"
          icon={<Hourglass className="text-edge-emerald" />}
          title={`Complete your enrollment in ${e?.batch.name ?? "your batch"}`}
          action={
            <Button asChild size="lg">
              <Link href="/checkout">Choose a payment plan</Link>
            </Button>
          }
        >
          Pay in full or reserve your seat with an advance. Your classes unlock once our team confirms your registration.
        </Shell>
      );
    case "PENDING_APPROVAL":
      return (
        <Shell
          tone="info"
          icon={<Clock className="text-edge-emerald" />}
          title="Payment received. We are verifying your registration."
          action={
            ent.canPayBalance ? (
              <Button asChild variant="outline">
                <Link href="/checkout/balance">Pay remaining balance</Link>
              </Button>
            ) : undefined
          }
        >
          This usually takes less than one working day. We will email you when your access is active.
        </Shell>
      );
    case "OVERDUE":
      return (
        <Shell
          tone="danger"
          icon={<AlertTriangle className="text-destructive" />}
          title="Your access is paused"
          action={
            e ? (
              <Button asChild size="lg">
                <Link href="/checkout/balance">Pay {formatMoney(e.remainingMinor, e.currency)}</Link>
              </Button>
            ) : undefined
          }
        >
          Your course balance was due on {e?.balanceDueOn ? formatDate(e.balanceDueOn) : "the due date"}. Pay it and your access returns immediately.
        </Shell>
      );
    case "LOCKED_MANUAL":
      return (
        <Shell tone="danger" icon={<Lock className="text-destructive" />} title="Your access is paused by the academy">
          {e?.lockNote ? `${e.lockNote}. ` : ""}Please contact {supportEmail}.
        </Shell>
      );
    case "REJECTED":
      return (
        <Shell tone="danger" icon={<XCircle className="text-destructive" />} title="We could not approve your registration">
          {e?.rejectionReason ? `Reason: ${e.rejectionReason}. ` : ""}Please contact {supportEmail}.
        </Shell>
      );
    case "CANCELLED":
      return (
        <Shell tone="warn" icon={<XCircle />} title="This enrollment was cancelled">
          Contact {supportEmail} if you think this is a mistake.
        </Shell>
      );
    default:
      return null;
  }
}
