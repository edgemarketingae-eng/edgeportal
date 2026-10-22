import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Gateway } from "@edge/domain/enums";
import { type CheckoutRequest, type GatewayAdapter, type GatewayDeps, type GatewayPayment, type GatewayStatus, type ParsedWebhook, WebhookSignatureError } from "./types";

/**
 * Mock gateway for development and CI. Behaves like a hosted checkout: the student is sent to the
 * student app's /dev/mock-checkout/<paymentId>, picks an outcome, and a SIGNED webhook is processed.
 * Its "API state" is the webhook inbox (read through GatewayDeps.latestEvent).
 */
export const MOCK_SIGNATURE_HEADER = "x-mock-signature";
export type MockOutcome = "succeeded" | "failed" | "cancelled" | "authorized";

export function signMockPayload(secret: string, body: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function buildMockWebhook(secret: string, paymentId: string, outcome: MockOutcome) {
  const body = JSON.stringify({ id: `evt_mock_${randomUUID()}`, type: `mock.payment.${outcome}`, paymentId, externalPaymentId: `mock_pi_${paymentId}` });
  return { body, signature: signMockPayload(secret, body) };
}

export class MockGatewayAdapter implements GatewayAdapter {
  readonly isMock = true;
  constructor(
    readonly gateway: Gateway,
    private secret: string,
    private checkoutPageBase: string,
    private deps: GatewayDeps,
  ) {}

  async createCheckout(req: CheckoutRequest) {
    return {
      redirectUrl: `${this.checkoutPageBase}/dev/mock-checkout/${req.payment.id}`,
      externalSessionId: `mock_cs_${req.payment.id}`,
      externalOrderId: null,
      expiresAt: new Date(Date.now() + (req.expiresInMinutes ?? 60) * 60_000),
    };
  }

  async parseWebhook(rawBody: string, headers: Headers): Promise<ParsedWebhook> {
    const sig = headers.get(MOCK_SIGNATURE_HEADER) ?? "";
    const expected = signMockPayload(this.secret, rawBody);
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new WebhookSignatureError("Invalid mock signature");
    const body = JSON.parse(rawBody) as { id: string; type: string; paymentId: string; externalPaymentId: string };
    return { externalEventId: body.id, type: body.type, paymentId: body.paymentId, externalPaymentId: body.externalPaymentId, payload: body };
  }

  async fetchStatus(payment: GatewayPayment): Promise<GatewayStatus> {
    const last = await this.deps.latestEvent(payment.id, "MOCK");
    switch (last?.type.replace("mock.payment.", "")) {
      case "succeeded":
        return { status: "SUCCEEDED", externalPaymentId: `mock_pi_${payment.id}`, amountMinor: payment.totalMinor, currency: payment.currency };
      case "authorized":
        return { status: "AUTHORIZED", externalPaymentId: `mock_pi_${payment.id}` };
      case "failed":
        return { status: "FAILED", failureReason: "Card declined (mock)" };
      case "cancelled":
        return { status: "CANCELLED" };
      default:
        return { status: "PENDING" };
    }
  }

  async capture(payment: GatewayPayment): Promise<GatewayStatus> {
    return { status: "SUCCEEDED", externalPaymentId: `mock_pi_${payment.id}`, amountMinor: payment.totalMinor, currency: payment.currency };
  }
}
