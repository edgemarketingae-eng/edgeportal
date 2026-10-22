import type { Gateway } from "@edge/domain/enums";

export type GatewayPaymentStatus = "PENDING" | "AUTHORIZED" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "EXPIRED";

/** The subset of a stored payment the adapters need (decoupled from the database model). */
export interface GatewayPayment {
  id: string;
  enrollmentId: string;
  kind: string;
  gateway: Gateway;
  feeRateKey: string;
  currency: string;
  totalMinor: number;
  idempotencyKey: string;
  externalSessionId: string | null;
  externalPaymentId: string | null;
  externalOrderId: string | null;
}

/** What the gateway API says about a payment. The gateway API, not the webhook body, is the source of truth. */
export interface GatewayStatus {
  status: GatewayPaymentStatus;
  externalPaymentId?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
  failureReason?: string | null;
}

export interface CheckoutCustomer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  country: string;
}

export interface CheckoutRequest {
  payment: GatewayPayment;
  customer: CheckoutCustomer;
  title: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  locale?: "en" | "ar";
  expiresInMinutes?: number;
}

export interface CheckoutSession {
  redirectUrl: string;
  externalSessionId: string;
  externalOrderId?: string | null;
  expiresAt?: Date | null;
}

export interface ParsedWebhook {
  externalEventId: string;
  type: string;
  paymentId?: string | null;
  externalSessionId?: string | null;
  externalPaymentId?: string | null;
  externalOrderId?: string | null;
  payload: unknown;
}

export class WebhookSignatureError extends Error {}
export class GatewayError extends Error {
  constructor(
    message: string,
    public userMessage = "The payment provider is not available right now. Please try another method or try again shortly.",
  ) {
    super(message);
  }
}

/** Data access the adapters need, injected by the services layer. */
export interface GatewayDeps {
  /** Latest signature-verified inbox event for this payment from `gateway`, optionally of given types. */
  latestEvent(paymentId: string, gateway: Gateway, types?: string[]): Promise<{ type: string; payload: unknown } | null>;
  buyerHistory(customerId: string): Promise<{ registeredSince: Date; successfulPayments: number }>;
}

export interface GatewayAdapter {
  readonly gateway: Gateway;
  readonly isMock: boolean;
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  /** Verify signature/JWT/header and normalise. Throws WebhookSignatureError when invalid. */
  parseWebhook(rawBody: string, headers: Headers, url: URL): Promise<ParsedWebhook>;
  fetchStatus(payment: GatewayPayment): Promise<GatewayStatus>;
  /** BNPL providers require an explicit authorise/capture step after approval. */
  capture?(payment: GatewayPayment): Promise<GatewayStatus>;
}
