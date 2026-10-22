import { Webhook } from "svix";
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
 * Nomod (UAE cards). We create a single-use payment link (POST /v1/links) whose success URL
 * carries our payment id. Webhooks are Svix-signed `charge.*` events. Because Nomod's public
 * docs do not say how a charge refers back to its link, a signature-verified `charge.completed`
 * event for this payment is accepted as confirmation, in addition to the link's status.
 * Verify both against the Nomod test environment before go-live.
 */
const PAID_WORDS = /paid|complete|succe/i;

export class NomodAdapter implements GatewayAdapter {
  readonly gateway = "NOMOD" as const;
  readonly isMock = false;
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private webhookSecret: string | undefined,
    private deps: GatewayDeps,
  ) {}

  private headers() {
    return { "X-API-KEY": this.apiKey };
  }

  async createCheckout(req: CheckoutRequest) {
    const { payment } = req;
    const res = await providerFetch<{ id: string; url: string }>("Nomod", `${this.baseUrl}/links`, {
      method: "POST",
      headers: this.headers(),
      json: {
        currency: payment.currency,
        title: req.title.slice(0, 50),
        note: `${req.description} · Ref ${payment.id}`.slice(0, 280),
        items: [{ name: req.title.slice(0, 100), amount: major(payment.totalMinor), quantity: 1 }],
        success_url: req.successUrl,
        failure_url: req.cancelUrl,
        allow_tabby: false,
        allow_tamara: false,
        allow_service_fee: false, // our processing fee is already in the amount
        allow_tip: false,
        shipping_address_required: false,
        payment_expiry_limit: 1,
      },
    });
    if (!res.url) throw new GatewayError("Nomod returned no link URL");
    return { redirectUrl: res.url, externalSessionId: res.id, externalOrderId: null, expiresAt: null };
  }

  async parseWebhook(rawBody: string, headers: Headers, _url?: URL): Promise<ParsedWebhook> {
    if (!this.webhookSecret) throw new WebhookSignatureError("NOMOD_WEBHOOK_SECRET is not configured");
    try {
      new Webhook(this.webhookSecret).verify(rawBody, {
        "svix-id": headers.get("svix-id") ?? "",
        "svix-timestamp": headers.get("svix-timestamp") ?? "",
        "svix-signature": headers.get("svix-signature") ?? "",
      });
    } catch (e) {
      throw new WebhookSignatureError(`Invalid Nomod signature: ${String(e)}`);
    }
    const body = JSON.parse(rawBody) as {
      type: string;
      eventId: string;
      objectId: string;
      data?: { successUrl?: string; referenceId?: string | number };
    };
    const fromUrl = body.data?.successUrl?.match(/\/api\/checkout\/return\/([a-z0-9]+)/i)?.[1] ?? null;
    return {
      externalEventId: body.eventId,
      type: `nomod.${body.type}`,
      paymentId: fromUrl,
      externalPaymentId: body.objectId,
      payload: body,
    };
  }

  async fetchStatus(payment: GatewayPayment): Promise<GatewayStatus> {
    const completed = await this.deps.latestEvent(payment.id, "NOMOD", ["nomod.charge.completed"]);
    if (completed) {
      const data = (completed.payload as { objectId?: string; data?: { total?: string | number; currency?: string } }) ?? {};
      return {
        status: "SUCCEEDED",
        externalPaymentId: data.objectId ?? null,
        amountMinor: data.data?.total != null ? Math.round(Number(data.data.total) * 100) : null,
        currency: data.data?.currency ?? null,
      };
    }
    const failed = await this.deps.latestEvent(payment.id, "NOMOD", ["nomod.charge.failed", "nomod.charge.cancelled"]);
    if (!payment.externalSessionId) return { status: failed ? "FAILED" : "PENDING" };
    try {
      const link = await providerFetch<{ status?: { name?: string; value?: string } | string }>(
        "Nomod",
        `${this.baseUrl}/links/${encodeURIComponent(payment.externalSessionId)}`,
        { headers: this.headers() },
      );
      const s = typeof link.status === "string" ? link.status : (link.status?.name ?? link.status?.value ?? "");
      if (PAID_WORDS.test(s)) return { status: "SUCCEEDED", amountMinor: null };
      if (/expire|disable|inactive/i.test(s)) return { status: "EXPIRED" };
    } catch {
      // fall through: rely on webhooks
    }
    return { status: failed ? "FAILED" : "PENDING" };
  }
}
