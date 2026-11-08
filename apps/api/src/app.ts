import "./http/context";
import { pingDb } from "@edge/db";
import { allowedFormOrigins, env } from "@edge/services";
import { toNodeHandler } from "better-auth/node";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import type { Auth } from "./auth";
import { errorHandler } from "./http/errors";
import { apiGate, clientRateLimit, publicCors, requestContext } from "./http/middleware";
import { mcpRouter } from "./mcp/router";
import { authRouter } from "./routes/auth";
import { adminRouter } from "./routes/admin";
import { devRouter } from "./routes/dev";
import { publicRouter } from "./routes/public";
import { studentRouter } from "./routes/student";
import { meRouter } from "./routes/me";
import { checkoutReturnRouter, paymentsRouter, webhookRouter } from "./routes/payments";
import { classesRouter, joinRouter, mediaRouter } from "./routes/classes";
import { crmRouter, leadWebhookRouter } from "./routes/crm";
import { filesRouter } from "./routes/files";
import { hrRouter } from "./routes/hr";
import { mobileAuthRouter, mobileRouter } from "./routes/mobile";
import { recordsRouter } from "./routes/records";
import { claudeRouter } from "./routes/claude";

export interface AppOptions {
  auth: Auth;
  logger?: boolean;
  extraRoutes?: (app: express.Express) => void;
}

/** Middleware order matters: Better Auth and raw-body webhooks must come before express.json(). */
export function createApp({ auth, logger = true, extraRoutes }: AppOptions) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", ["loopback", "uniquelocal"]);
  app.use(requestContext);
  if (logger)
    app.use(
      pinoHttp({
        genReqId: (req) => (req as express.Request).requestId,
        autoLogging: { ignore: (req) => req.url === "/api/health" },
        // Bearer tokens (phones, Claude), forwarded session cookies and the internal token never go to the logs.
        redact: {
          paths: ["req.headers.authorization", "req.headers.cookie", 'req.headers["x-internal-token"]', 'res.headers["set-cookie"]'],
          censor: "[redacted]",
        },
      }),
    );
  app.use(helmet({ crossOriginResourcePolicy: false, contentSecurityPolicy: false }));

  app.get("/api/health", async (_req, res) => {
    const db = await pingDb().catch(() => false);
    res.status(db ? 200 : 503).json({ ok: db, db: db ? "up" : "down", time: new Date().toISOString() });
  });

  app.all("/api/auth/*splat", toNodeHandler(auth));

  // Raw-body and browser routes that must come before express.json().
  app.use(leadWebhookRouter()); // /api/webhooks/leads/:source, before the single-segment :gateway route
  app.use(webhookRouter());
  app.use(checkoutReturnRouter());
  app.use(mediaRouter());
  app.use(joinRouter(auth));
  extraRoutes?.(app);

  app.use(express.json({ limit: "1mb" }));
  // Browser-facing auth policy endpoints (through the apps' rewrites).
  app.use(authRouter(auth));
  // Browser-facing forms on the academy's other sites (Forex Growth Hub, website forms), straight to the public API host.
  app.use("/api/public", publicCors(allowedFormOrigins));
  app.use(publicRouter());
  app.use(mobileAuthRouter(auth));
  // The Claude connector: /mcp plus its OAuth endpoints at the root (MCP_ENABLED=false takes all of it away).
  if (env.MCP_ENABLED) app.use(mcpRouter());
  // Everything else under /api/v1 is internal (Next.js servers with the forwarded session cookie), the CRM phone app,
  // or our own /mcp endpoint acting for someone.
  app.use("/api/v1", apiGate(auth), clientRateLimit());
  app.use(meRouter());
  app.use(studentRouter());
  app.use(paymentsRouter());
  app.use(classesRouter());
  app.use(adminRouter());
  app.use(crmRouter());
  app.use(mobileRouter());
  app.use(hrRouter());
  app.use(recordsRouter());
  app.use(claudeRouter());
  app.use(filesRouter());
  app.use(devRouter());

  app.use((_req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } }));
  app.use(errorHandler);
  return app;
}
