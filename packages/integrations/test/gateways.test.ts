import { SignJWT } from "jose";
import { Webhook } from "svix";
import { describe, expect, it } from "vitest";
import { NomodAdapter } from "../src/gateways/nomod";
import { mapTabbyStatus, TABBY_WEBHOOK_HEADER, TabbyAdapter } from "../src/gateways/tabby";
import { mapTamaraStatus, TamaraAdapter } from "../src/gateways/tamara";
import { WebhookSignatureError } from "../src/gateways/types";

const url = new URL("https://portal.test/api/webhooks/x");

describe("status mapping", () => {
  it("tabby: capture completes the payment", () => {
    expect(mapTabbyStatus("AUTHORIZED", 0, 100)).toBe("AUTHORIZED");
    expect(mapTabbyStatus("closed", 100, 100)).toBe("SUCCEEDED");
    expect(mapTabbyStatus("CLOSED", 0, 100)).toBe("CANCELLED"); // closed without capture = voided
    expect(mapTabbyStatus("REJECTED", 0, 100)).toBe("FAILED");
  });
  it("tamara: approved needs authorise + capture", () => {
    expect(mapTamaraStatus("approved")).toBe("AUTHORIZED");
    expect(mapTamaraStatus("fully_captured")).toBe("SUCCEEDED");
    expect(mapTamaraStatus("declined")).toBe("FAILED");
    expect(mapTamaraStatus("new")).toBe("PENDING");
  });
});

describe("webhook verification", () => {
  it("tabby checks the shared header secret", async () => {
    const a = new TabbyAdapter("https://api.tabby.ai", "sk", "mc", "s3cret-value");
    const body = JSON.stringify({ id: "pay_1", status: "authorized", order: { reference_id: "p1" } });
    await expect(a.parseWebhook(body, new Headers({ [TABBY_WEBHOOK_HEADER]: "nope-nope-nope" }), url)).rejects.toBeInstanceOf(
      WebhookSignatureError,
    );
    const ok = await a.parseWebhook(body, new Headers({ [TABBY_WEBHOOK_HEADER]: "s3cret-value" }), url);
    expect(ok).toMatchObject({ paymentId: "p1", externalOrderId: "pay_1", type: "tabby.authorized" });
  });

  it("tamara verifies the HS256 tamaraToken", async () => {
    const secret = "tamara-notification-token";
    const a = new TamaraAdapter("https://api-sandbox.tamara.co", "t", secret, "https://portal.test/api/webhooks/tamara");
    const body = JSON.stringify({ order_id: "o1", order_reference_id: "p1", order_status: "approved", event_type: "order_approved" });
    const good = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setIssuedAt().sign(new TextEncoder().encode(secret));
    const bad = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).sign(new TextEncoder().encode("wrong"));
    await expect(a.parseWebhook(body, new Headers(), new URL(`${url}?tamaraToken=${bad}`))).rejects.toBeInstanceOf(WebhookSignatureError);
    const ok = await a.parseWebhook(body, new Headers(), new URL(`${url}?tamaraToken=${good}`));
    expect(ok).toMatchObject({ paymentId: "p1", externalOrderId: "o1", type: "tamara.order_approved" });
  });

  it("nomod verifies the Svix signature and recovers our payment id", async () => {
    const secret = `whsec_${Buffer.from("nomod-test-secret-0123456789").toString("base64")}`;
    const a = new NomodAdapter("https://api.nomod.com/v1", "k", secret, { latestEvent: async () => null, buyerHistory: async () => ({ registeredSince: new Date(), successfulPayments: 0 }) });
    const body = JSON.stringify({
      type: "charge.completed",
      eventId: "evt_1",
      objectId: "ch_1",
      data: { successUrl: "https://portal.test/api/checkout/return/cmabc123xyz", total: "308.52" },
    });
    const wh = new Webhook(secret);
    const id = "msg_1";
    const ts = new Date();
    const sig = wh.sign(id, ts, body);
    const headers = new Headers({ "svix-id": id, "svix-timestamp": String(Math.floor(ts.getTime() / 1000)), "svix-signature": sig });
    const ok = await a.parseWebhook(body, headers, url);
    expect(ok).toMatchObject({ paymentId: "cmabc123xyz", externalPaymentId: "ch_1", type: "nomod.charge.completed" });
    headers.set("svix-signature", "v1,AAAA");
    await expect(a.parseWebhook(body, headers, url)).rejects.toBeInstanceOf(WebhookSignatureError);
  });
});
