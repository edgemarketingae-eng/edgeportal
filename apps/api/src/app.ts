import "./http/context";
import { pingDb } from "@edge/db";
import { toNodeHandler } from "better-auth/node";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import type { Auth } from "./auth";
import { errorHandler } from "./http/errors";
import { internalOnly, loadViewerMiddleware, requestContext } from "./http/middleware";
import { authRouter } from "./routes/auth";
import { adminRouter } from "./routes/admin";
import { devRouter } from "./routes/dev";
import { studentRouter } from "./routes/student";
import { meRouter } from "./routes/me";
import { checkoutReturnRouter, paymentsRouter, webhookRouter } from "./routes/payments";
import { classesRouter, joinRouter, mediaRouter } from "./routes/classes";

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
  if (logger) app.use(pinoHttp({ genReqId: (req) => (req as express.Request).requestId, autoLogging: { ignore: (req) => req.url === "/api/health" } }));
  app.use(helmet({ crossOriginResourcePolicy: false, contentSecurityPolicy: false }));

  app.get("/api/health", async (_req, res) => {
    const db = await pingDb().catch(() => false);
    res.status(db ? 200 : 503).json({ ok: db, db: db ? "up" : "down", time: new Date().toISOString() });
  });

  app.all("/api/auth/*splat", toNodeHandler(auth));

  // Raw-body and browser routes that must come before express.json().
  app.use(webhookRouter());
  app.use(checkoutReturnRouter());
  app.use(mediaRouter());
  app.use(joinRouter(auth));
  extraRoutes?.(app);

  app.use(express.json({ limit: "1mb" }));
  // Browser-facing auth policy endpoints (through the apps' rewrites).
  app.use(authRouter(auth));
  // Everything else under /api/v1 is internal: Next.js servers only, with the forwarded session cookie.
  app.use("/api/v1", internalOnly, loadViewerMiddleware(auth));
  app.use(meRouter());
  app.use(studentRouter());
  app.use(paymentsRouter());
  app.use(classesRouter());
  app.use(adminRouter());
  app.use(devRouter());

  app.use((_req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } }));
  app.use(errorHandler);
  return app;
}
