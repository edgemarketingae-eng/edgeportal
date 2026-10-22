import type { PaymentDoc } from "@edge/db";
import type { GatewayPayment } from "@edge/integrations/gateways/types";

export function toGatewayPayment(p: PaymentDoc): GatewayPayment {
  return {
    id: String(p._id),
    enrollmentId: String(p.enrollmentId),
    kind: p.kind,
    gateway: p.gateway,
    feeRateKey: p.feeRateKey,
    currency: p.currency,
    totalMinor: p.totalMinor,
    idempotencyKey: p.idempotencyKey,
    externalSessionId: p.externalSessionId ?? null,
    externalPaymentId: p.externalPaymentId ?? null,
    externalOrderId: p.externalOrderId ?? null,
  };
}
