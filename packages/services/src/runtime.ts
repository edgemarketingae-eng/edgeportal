import { AuthUser, Payment, PaymentEvent, Types } from "@edge/db";
import { createEmailSender, type EmailSender } from "@edge/integrations/email/index";
import { createGatewayRegistry, type GatewayRegistry } from "@edge/integrations/gateways/registry";
import { createMailerLite, type MailerLiteApi } from "@edge/integrations/mailerlite/client";
import { createOdooClient, type OdooClient } from "@edge/integrations/odoo/client";
import { createGoogleWorkspace, type GoogleWorkspace } from "@edge/integrations/google/workspace";
import type { GatewayDeps } from "@edge/integrations/gateways/types";
import { createOtpProvider, type OtpProvider } from "@edge/integrations/twilio/verify";
import { createBullProducer, dispatchOutbox, type JobProducer } from "@edge/jobs";
import path from "node:path";
import { env } from "./env";
import { workspaceRoot } from "./paths";

/** Mock Drive video: MOCK_DRIVE_FILE, else the repo's fixtures/sample.mp4. */
function mockDriveFile() {
  return env.MOCK_DRIVE_FILE ?? path.join(workspaceRoot(), "fixtures", "sample.mp4");
}

/**
 * Provider wiring. The API and worker use the env-based defaults; tests inject doubles
 * with configureRuntime(). Later milestones add gateways, Odoo, Google and MailerLite here.
 */
export interface Runtime {
  producer: JobProducer;
  otp: OtpProvider;
  email: EmailSender;
  gateways: GatewayRegistry;
  odoo: OdooClient;
  mailerlite: MailerLiteApi;
  google: GoogleWorkspace;
}

/** Data the payment adapters may read (kept out of the integrations package). */
export const gatewayDeps: GatewayDeps = {
  async latestEvent(paymentId, gateway, types) {
    if (!Types.ObjectId.isValid(paymentId)) return null;
    const ev = await PaymentEvent.findOne({ paymentId: new Types.ObjectId(paymentId), gateway, signatureOk: true, ...(types ? { type: { $in: types } } : {}) })
      .sort({ receivedAt: -1 })
      .lean();
    return ev ? { type: ev.type, payload: ev.payload } : null;
  },
  async buyerHistory(customerId) {
    const _id = new Types.ObjectId(customerId);
    const [u, count] = await Promise.all([AuthUser.findById(_id, { createdAt: 1 }).lean(), Payment.countDocuments({ studentId: _id, status: "SUCCEEDED" })]);
    return { registeredSince: u?.createdAt ?? new Date(), successfulPayments: count };
  },
};

let current: Partial<Runtime> = {};

export function configureRuntime(overrides: Partial<Runtime>) {
  current = { ...current, ...overrides };
}

export function resetRuntime() {
  current = {};
}

/** Close open connections (the BullMQ producer's Redis socket) so short-lived scripts can exit. */
export async function closeRuntime() {
  await current.producer?.close?.().catch(() => undefined);
  current = {};
}

/**
 * Each provider is built the first time it is used, so an integration that is not configured yet
 * (OTP_MODE=live without Twilio keys, say) fails only where it is needed, not in every request.
 */
const factories: { [K in keyof Runtime]: () => Runtime[K] } = {
  producer: () => createBullProducer(env.REDIS_URL, env.BULLMQ_PREFIX),
  otp: () => createOtpProvider({ mode: env.OTP_MODE, accountSid: env.TWILIO_ACCOUNT_SID, authToken: env.TWILIO_AUTH_TOKEN, serviceSid: env.TWILIO_VERIFY_SERVICE_SID }),
  email: () => createEmailSender({ mode: env.EMAIL_MODE, from: env.EMAIL_FROM, mailersendApiKey: env.MAILERSEND_API_KEY }),
  gateways: () =>
    createGatewayRegistry(
      {
        mode: env.PAYMENTS_MODE,
        allowMock: env.PAYMENTS_MODE === "mock" && (env.NODE_ENV !== "production" || env.ALLOW_MOCK_IN_PRODUCTION),
        mockSecret: env.MOCK_GATEWAY_SECRET,
        studentAppUrl: env.STUDENT_APP_URL,
        apiPublicUrl: env.API_PUBLIC_URL,
        stripe: { secretKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET },
        tabby: { apiUrl: env.TABBY_API_URL, secretKey: env.TABBY_SECRET_KEY, merchantCode: env.TABBY_MERCHANT_CODE, webhookHeaderValue: env.TABBY_WEBHOOK_HEADER_VALUE },
        tamara: { apiUrl: env.TAMARA_API_URL, apiToken: env.TAMARA_API_TOKEN, notificationToken: env.TAMARA_NOTIFICATION_TOKEN },
        nomod: { apiUrl: env.NOMOD_API_URL, apiKey: env.NOMOD_API_KEY, webhookSecret: env.NOMOD_WEBHOOK_SECRET },
      },
      gatewayDeps,
    ),
  odoo: () => createOdooClient({ mode: env.ODOO_MODE, url: env.ODOO_URL, db: env.ODOO_DB, apiKey: env.ODOO_API_KEY }),
  mailerlite: () => createMailerLite({ mode: env.MAILERLITE_MODE, apiKey: env.MAILERLITE_API_KEY }),
  google: () => createGoogleWorkspace({ mode: env.GOOGLE_MODE, serviceAccountJson: env.GOOGLE_SERVICE_ACCOUNT_JSON, timeZone: env.TZ_DEFAULT, mockDriveFile: mockDriveFile() }),
};

function provide<K extends keyof Runtime>(key: K): Runtime[K] {
  return (current[key] ??= factories[key]());
}

const lazyRuntime = Object.defineProperties(
  {} as Runtime,
  Object.fromEntries((Object.keys(factories) as (keyof Runtime)[]).map((key) => [key, { get: () => provide(key), enumerable: true }])),
);

export function runtime(): Runtime {
  return lazyRuntime;
}

/** Call after a transaction commits. Failures are fine: the outbox sweeper retries. */
export async function flushOutbox() {
  try {
    await dispatchOutbox(runtime().producer);
  } catch (e) {
    console.error("[outbox] dispatch failed", (e as Error).message);
  }
}
