import { z } from "zod";

/**
 * Server configuration shared by the API and the worker. Every integration has a MODE
 * (mock | sandbox | live); production refuses mock modes unless ALLOW_MOCK_IN_PRODUCTION=true.
 */
const mode = z.enum(["mock", "sandbox", "live"]);

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().default(4000),
    MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27017/edge_dev?replicaSet=rs0"),
    REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
    BULLMQ_PREFIX: z.string().default("edge"),
    INTERNAL_API_TOKEN: z.string().min(24).default("dev-internal-token-change-me-0123456789"),
    BETTER_AUTH_SECRET: z.string().min(32).default("dev-only-better-auth-secret-0123456789abcdef"),
    MEDIA_SIGNING_SECRET: z.string().min(16).default("dev-only-media-secret-0123"),
    STUDENT_APP_URL: z.url().default("http://student.localhost:3000"),
    CONSOLE_APP_URL: z.url().default("http://console.localhost:3001"),
    CRM_APP_URL: z.url().default("http://crm.localhost:3002"),
    API_PUBLIC_URL: z.url().default("http://localhost:4000"),
    TZ_DEFAULT: z.string().default("Asia/Dubai"),
    ALLOW_MOCK_IN_PRODUCTION: z.stringbool().default(false),
    REQUIRE_ADMIN_2FA: z.stringbool().optional(),
    DEV_ROUTES: z.stringbool().optional(),

    OTP_MODE: mode.default("mock"),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_VERIFY_SERVICE_SID: z.string().optional(),

    EMAIL_MODE: z.enum(["console", "mailersend"]).default("console"),
    EMAIL_FROM: z.string().default("Edge Trading Academy <no-reply@edgeacademy.ae>"),
    MAILERSEND_API_KEY: z.string().optional(),

    PAYMENTS_MODE: mode.default("mock"),
    MOCK_GATEWAY_SECRET: z.string().default("mock-gateway-secret"),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    NOMOD_API_KEY: z.string().optional(),
    NOMOD_WEBHOOK_SECRET: z.string().optional(),
    NOMOD_API_URL: z.string().default("https://api.nomod.com/v1"),
    TABBY_SECRET_KEY: z.string().optional(),
    TABBY_MERCHANT_CODE: z.string().optional(),
    TABBY_WEBHOOK_HEADER_VALUE: z.string().optional(),
    TABBY_API_URL: z.string().default("https://api.tabby.ai"),
    TAMARA_API_TOKEN: z.string().optional(),
    TAMARA_NOTIFICATION_TOKEN: z.string().optional(),
    TAMARA_API_URL: z.string().optional(),

    ODOO_MODE: mode.default("mock"),
    ODOO_URL: z.string().optional(),
    ODOO_DB: z.string().optional(),
    ODOO_API_KEY: z.string().optional(),

    GOOGLE_MODE: mode.default("mock"),
    GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
    GOOGLE_DEFAULT_ORGANIZER: z.string().optional(),
    MOCK_DRIVE_FILE: z.string().optional(),

    /** Default: <repo root>/.media-cache (shared by api and worker in development). */
    MEDIA_CACHE_DIR: z.string().optional(),
    MEDIA_CACHE_MAX_GB: z.coerce.number().default(150),

    MAILERLITE_MODE: mode.default("mock"),
    MAILERLITE_API_KEY: z.string().optional(),

    /** Shared secret for POST /api/webhooks/leads/:source (website lead forms). Unset = endpoint disabled. */
    LEAD_WEBHOOK_SECRET: z.string().min(16).optional(),
  })
  .superRefine((e, ctx) => {
    if (e.EMAIL_MODE === "mailersend" && !e.MAILERSEND_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["MAILERSEND_API_KEY"], message: "MAILERSEND_API_KEY is required for EMAIL_MODE=mailersend" });
    }
    if (e.NODE_ENV !== "production" || e.ALLOW_MOCK_IN_PRODUCTION) return;
    for (const key of ["OTP_MODE", "PAYMENTS_MODE", "ODOO_MODE", "GOOGLE_MODE", "MAILERLITE_MODE"] as const) {
      if (e[key] === "mock") ctx.addIssue({ code: "custom", path: [key], message: `${key}=mock is not allowed in production` });
    }
    // EMAIL_MODE=console is allowed in production until MailerSend is set up: emails go to the worker log.
    for (const key of ["INTERNAL_API_TOKEN", "BETTER_AUTH_SECRET", "MEDIA_SIGNING_SECRET"] as const) {
      if (e[key].startsWith("dev-")) ctx.addIssue({ code: "custom", path: [key], message: `${key} must be set in production` });
    }
  });

export type Env = z.infer<typeof schema>;
let cached: Env | undefined;

export function getEnv(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid environment configuration:\n${parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n")}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export function resetEnvForTests() {
  cached = undefined;
}

export const env = new Proxy({} as Env, { get: (_t, prop: string) => getEnv()[prop as keyof Env] });

export function devRoutesEnabled() {
  return env.DEV_ROUTES ?? env.NODE_ENV !== "production";
}
