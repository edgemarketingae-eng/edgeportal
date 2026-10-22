import { jwtVerify } from "jose";
import { major, providerFetch, splitName } from "./http";
import {
  type CheckoutRequest,
  GatewayError,
  type GatewayAdapter,
  type GatewayPayment,
  type GatewayStatus,
  type ParsedWebhook,
  WebhookSignatureError,
} from "./types";

/**
 * Tamara (UAE, AED). Flow: create checkout -> customer approves -> `order_approved` notification
 * -> we authorise -> we capture. Notifications carry `tamaraToken` (HS256 JWT signed with the
 * notification token). Verify against the Tamara sandbox before go-live.
 */
export function mapTamaraStatus(status: string | undefined): GatewayStatus["status"] {
  switch ((status ?? "").toLowerCase()) {
    case "approved":
    case "authorised":
    case "partially_captured":
      return "AUTHORIZED";
    case "fully_captured":
      return "SUCCEEDED";
    case "declined":
      return "FAILED";
    case "expired":
      return "EXPIRED";
    case "canceled":
    case "cancelled":
      return "CANCELLED";
    default:
      return "PENDING";
  }
}

interface TamaraOrder {
  order_id: string;
  order_reference_id?: string;
  status: string;
  total_amount?: { amount: number; currency: string };
}

export class TamaraAdapter implements GatewayAdapter {
  readonly gateway = "TAMARA" as const;
  readonly isMock = false;
  constructor(
    private baseUrl: string,
    private apiToken: string,
    private notificationToken: string | undefined,
    private notificationUrl: string,
  ) {}

  private headers() {
    return { Authorization: `Bearer ${this.apiToken}` };
  }

  async createCheckout(req: CheckoutRequest) {
    const { payment, customer } = req;
    const amount = { amount: Number(major(payment.totalMinor)), currency: payment.currency };
    const zero = { amount: 0, currency: payment.currency };
    const name = splitName(customer.name);
    const res = await providerFetch<{ order_id: string; checkout_id: string; checkout_url: string; status: string }>(
      "Tamara",
      `${this.baseUrl}/checkout`,
      {
        method: "POST",
        headers: this.headers(),
        json: {
          total_amount: amount,
          shipping_amount: zero,
          tax_amount: zero,
          order_reference_id: payment.id,
          order_number: payment.id,
          description: req.title,
          country_code: customer.country === "SA" ? "SA" : "AE",
          payment_type: "PAY_BY_INSTALMENTS",
          instalments: 4,
          locale: req.locale === "ar" ? "ar_SA" : "en_US",
          items: [
            {
              name: req.title,
              type: "Digital",
              reference_id: payment.id,
              sku: payment.feeRateKey,
              quantity: 1,
              total_amount: amount,
              unit_price: amount,
            },
          ],
          consumer: { first_name: name.first, last_name: name.last, email: customer.email, phone_number: customer.phone ?? "" },
          shipping_address: {
            first_name: name.first,
            last_name: name.last,
            line1: "Online course - no shipping",
            city: "Dubai",
            country_code: "AE",
            phone_number: customer.phone ?? "",
          },
          merchant_url: { success: req.successUrl, failure: req.cancelUrl, cancel: req.cancelUrl, notification: this.notificationUrl },
          platform: "Edge Academy Portal",
          is_mobile: false,
        },
      },
    );
    if (!res.checkout_url)
      throw new GatewayError(
        "Tamara returned no checkout URL",
        "Tamara is not available for this purchase. Please choose another payment method.",
      );
    return { redirectUrl: res.checkout_url, externalSessionId: res.checkout_id, externalOrderId: res.order_id, expiresAt: null };
  }

  async parseWebhook(rawBody: string, headers: Headers, url: URL): Promise<ParsedWebhook> {
    const token = url.searchParams.get("tamaraToken") ?? headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!this.notificationToken || !token) throw new WebhookSignatureError("Missing Tamara token");
    try {
      await jwtVerify(token, new TextEncoder().encode(this.notificationToken), { algorithms: ["HS256"] });
    } catch (e) {
      throw new WebhookSignatureError(`Invalid Tamara token: ${String(e)}`);
    }
    const body = JSON.parse(rawBody) as { order_id: string; order_reference_id?: string; order_status?: string; event_type?: string };
    return {
      externalEventId: `${body.order_id}:${body.event_type ?? body.order_status ?? "notification"}`,
      type: `tamara.${body.event_type ?? body.order_status ?? "notification"}`,
      paymentId: body.order_reference_id ?? null,
      externalOrderId: body.order_id,
      payload: body,
    };
  }

  private async getOrder(orderId: string) {
    return providerFetch<TamaraOrder>("Tamara", `${this.baseUrl}/orders/${encodeURIComponent(orderId)}`, { headers: this.headers() });
  }

  async fetchStatus(payment: GatewayPayment): Promise<GatewayStatus> {
    if (!payment.externalOrderId) return { status: "PENDING" };
    const o = await this.getOrder(payment.externalOrderId);
    return {
      status: mapTamaraStatus(o.status),
      externalPaymentId: o.order_id,
      amountMinor: o.total_amount ? Math.round(o.total_amount.amount * 100) : null,
      currency: o.total_amount?.currency ?? null,
    };
  }

  async capture(payment: GatewayPayment): Promise<GatewayStatus> {
    const orderId = payment.externalOrderId!;
    let o = await this.getOrder(orderId);
    if (o.status === "approved") {
      await providerFetch("Tamara", `${this.baseUrl}/orders/${encodeURIComponent(orderId)}/authorise`, {
        method: "POST",
        headers: this.headers(),
        json: {},
      });
      o = await this.getOrder(orderId);
    }
    if (o.status === "authorised") {
      await providerFetch("Tamara", `${this.baseUrl}/payments/capture`, {
        method: "POST",
        headers: this.headers(),
        json: {
          order_id: orderId,
          total_amount: { amount: Number(major(payment.totalMinor)), currency: payment.currency },
          shipping_info: { shipped_at: new Date().toISOString(), shipping_company: "N/A (digital)" },
        },
      });
    }
    return this.fetchStatus(payment);
  }
}
