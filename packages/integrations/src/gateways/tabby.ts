import { timingSafeEqual } from "node:crypto";
import { major, providerFetch } from "./http";
import {
  type CheckoutRequest,
  GatewayError,
  type GatewayAdapter,
  type GatewayDeps,
  type GatewayPayment,
  type GatewayStatus,
  type ParsedWebhook,
  WebhookSignatureError,
} from "./types";

/**
 * Tabby Pay-in-4 (UAE, AED). Flow: create checkout session (pre-scoring) -> redirect ->
 * payment AUTHORIZED -> we capture -> CLOSED. KSA needs SAR and a separate merchant (not enabled).
 * Verify field names against the Tabby sandbox before go-live.
 */
export const TABBY_WEBHOOK_HEADER = "x-edge-webhook-secret";

export function mapTabbyStatus(status: string | undefined, capturedMinor: number, totalMinor: number): GatewayStatus["status"] {
  switch ((status ?? "").toUpperCase()) {
    case "AUTHORIZED":
      return "AUTHORIZED";
    case "CLOSED":
      return capturedMinor >= totalMinor ? "SUCCEEDED" : "CANCELLED";
    case "REJECTED":
      return "FAILED";
    case "EXPIRED":
      return "EXPIRED";
    default:
      return "PENDING";
  }
}

interface TabbyPayment {
  id: string;
  status: string;
  amount: string;
  currency: string;
  captures?: { amount: string }[];
}

export class TabbyAdapter implements GatewayAdapter {
  readonly gateway = "TABBY" as const;
  readonly isMock = false;
  constructor(
    private baseUrl: string,
    private secretKey: string,
    private merchantCode: string,
    private webhookSecret: string | undefined,
    private deps?: GatewayDeps,
  ) {}

  private headers() {
    return { Authorization: `Bearer ${this.secretKey}` };
  }

  async createCheckout(req: CheckoutRequest) {
    const { payment, customer } = req;
    const history = (await this.deps?.buyerHistory(customer.id)) ?? { registeredSince: new Date(), successfulPayments: 0 };
    const amount = major(payment.totalMinor);
    const res = await providerFetch<{
      id: string;
      status: string;
      payment?: { id: string };
      configuration?: {
        available_products?: { installments?: { web_url: string }[] };
        products?: { installments?: { rejection_reason?: string } };
      };
    }>("Tabby", `${this.baseUrl}/api/v2/checkout`, {
      method: "POST",
      headers: this.headers(),
      json: {
        payment: {
          amount,
          currency: payment.currency,
          description: req.title,
          buyer: { name: customer.name, email: customer.email, phone: customer.phone ?? "" },
          shipping_address: { city: "Dubai", address: "Online course - no shipping", zip: "00000" },
          order: {
            reference_id: payment.id,
            tax_amount: "0.00",
            shipping_amount: "0.00",
            discount_amount: "0.00",
            items: [
              {
                title: req.title,
                description: req.description.slice(0, 250),
                quantity: 1,
                unit_price: amount,
                reference_id: payment.id,
                category: "Education",
              },
            ],
          },
          buyer_history: { registered_since: history.registeredSince.toISOString(), loyalty_level: history.successfulPayments },
          meta: { order_id: payment.id, customer: customer.id },
        },
        lang: req.locale ?? "en",
        merchant_code: this.merchantCode,
        merchant_urls: { success: req.successUrl, cancel: req.cancelUrl, failure: req.cancelUrl },
      },
    });
    const url = res.configuration?.available_products?.installments?.[0]?.web_url;
    if (res.status !== "created" || !url || !res.payment?.id) {
      throw new GatewayError(
        `Tabby rejected the session: ${res.status}`,
        "Tabby could not approve this purchase. Please choose another payment method.",
      );
    }
    return { redirectUrl: url, externalSessionId: res.id, externalOrderId: res.payment.id, expiresAt: null };
  }

  async parseWebhook(rawBody: string, headers: Headers, _url?: URL): Promise<ParsedWebhook> {
    const given = headers.get(TABBY_WEBHOOK_HEADER) ?? "";
    if (
      !this.webhookSecret ||
      given.length !== this.webhookSecret.length ||
      !timingSafeEqual(Buffer.from(given), Buffer.from(this.webhookSecret))
    ) {
      throw new WebhookSignatureError("Invalid Tabby webhook secret");
    }
    const body = JSON.parse(rawBody) as { id: string; status?: string; order?: { reference_id?: string }; captures?: unknown[] };
    return {
      externalEventId: `${body.id}:${body.status ?? "unknown"}:${Array.isArray(body.captures) ? body.captures.length : 0}`,
      type: `tabby.${(body.status ?? "unknown").toLowerCase()}`,
      paymentId: body.order?.reference_id ?? null,
      externalOrderId: body.id,
      payload: body,
    };
  }

  private async getPayment(id: string) {
    return providerFetch<TabbyPayment>("Tabby", `${this.baseUrl}/api/v2/payments/${encodeURIComponent(id)}`, { headers: this.headers() });
  }

  private toStatus(p: TabbyPayment, payment: GatewayPayment): GatewayStatus {
    const captured = Math.round((p.captures ?? []).reduce((s, c) => s + Number(c.amount), 0) * 100);
    return {
      status: mapTabbyStatus(p.status, captured, payment.totalMinor),
      externalPaymentId: p.id,
      amountMinor: captured || Math.round(Number(p.amount) * 100),
      currency: p.currency,
    };
  }

  async fetchStatus(payment: GatewayPayment): Promise<GatewayStatus> {
    if (!payment.externalOrderId) return { status: "PENDING" };
    return this.toStatus(await this.getPayment(payment.externalOrderId), payment);
  }

  async capture(payment: GatewayPayment): Promise<GatewayStatus> {
    const id = payment.externalOrderId!;
    await providerFetch("Tabby", `${this.baseUrl}/api/v2/payments/${encodeURIComponent(id)}/captures`, {
      method: "POST",
      headers: this.headers(),
      json: { amount: major(payment.totalMinor), reference_id: `cap-${payment.id}` },
    });
    return this.toStatus(await this.getPayment(id), payment);
  }
}
