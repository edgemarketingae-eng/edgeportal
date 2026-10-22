import Stripe from "stripe";
import {
  type CheckoutRequest,
  GatewayError,
  type GatewayAdapter,
  type GatewayPayment,
  type GatewayStatus,
  type ParsedWebhook,
  WebhookSignatureError,
} from "./types";

/** Stripe Checkout (hosted page, card data never touches our servers). */
export class StripeAdapter implements GatewayAdapter {
  readonly gateway = "STRIPE" as const;
  readonly isMock = false;
  private stripe: Stripe;

  constructor(
    secretKey: string,
    private webhookSecret: string | undefined,
  ) {
    this.stripe = new Stripe(secretKey, { maxNetworkRetries: 2, appInfo: { name: "edge-academy-portal" } });
  }

  async createCheckout(req: CheckoutRequest) {
    const { payment } = req;
    try {
      const session = await this.stripe.checkout.sessions.create(
        {
          mode: "payment",
          customer_email: req.customer.email,
          client_reference_id: payment.id,
          metadata: { paymentId: payment.id, enrollmentId: payment.enrollmentId, kind: payment.kind },
          payment_intent_data: { description: req.title, metadata: { paymentId: payment.id } },
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: payment.currency.toLowerCase(),
                unit_amount: payment.totalMinor,
                product_data: { name: req.title, description: req.description.slice(0, 500) },
              },
            },
          ],
          success_url: req.successUrl,
          cancel_url: req.cancelUrl,
          expires_at: Math.floor(Date.now() / 1000) + Math.min(24 * 60, Math.max(30, req.expiresInMinutes ?? 60)) * 60, // Stripe allows 30 min - 24 h
          locale: req.locale ?? "auto",
        },
        { idempotencyKey: payment.idempotencyKey },
      );
      if (!session.url) throw new Error("Stripe returned no checkout URL");
      return { redirectUrl: session.url, externalSessionId: session.id, expiresAt: new Date(session.expires_at * 1000) };
    } catch (e) {
      throw new GatewayError(`Stripe checkout failed: ${String(e)}`);
    }
  }

  async parseWebhook(rawBody: string, headers: Headers, _url?: URL): Promise<ParsedWebhook> {
    if (!this.webhookSecret) throw new WebhookSignatureError("STRIPE_WEBHOOK_SECRET is not configured");
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, headers.get("stripe-signature") ?? "", this.webhookSecret);
    } catch (e) {
      throw new WebhookSignatureError(String(e));
    }
    const obj = event.data.object as {
      id?: string;
      client_reference_id?: string | null;
      metadata?: Record<string, string> | null;
      payment_intent?: string | null;
    };
    const isSession = event.type.startsWith("checkout.session.");
    return {
      externalEventId: event.id,
      type: event.type,
      paymentId: obj.client_reference_id ?? obj.metadata?.paymentId ?? null,
      externalSessionId: isSession ? (obj.id ?? null) : null,
      externalPaymentId: isSession ? (typeof obj.payment_intent === "string" ? obj.payment_intent : null) : (obj.id ?? null),
      payload: event,
    };
  }

  async fetchStatus(payment: GatewayPayment): Promise<GatewayStatus> {
    if (!payment.externalSessionId) return { status: "PENDING" };
    const s = await this.stripe.checkout.sessions.retrieve(payment.externalSessionId);
    const pi = typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent?.id ?? null);
    if (s.payment_status === "paid" || s.payment_status === "no_payment_required") {
      return { status: "SUCCEEDED", externalPaymentId: pi, amountMinor: s.amount_total, currency: s.currency?.toUpperCase() ?? null };
    }
    if (s.status === "expired") return { status: "EXPIRED" };
    return { status: "PENDING", externalPaymentId: pi };
  }
}
