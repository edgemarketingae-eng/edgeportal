import { ApiError, fieldErrorsFromIssues, publicRoutes, WebsiteLeadInput } from "@edge/contracts";
import { allowedFormOrigins, captureGrowthHubLead, submitWebsiteForm } from "@edge/services";
import express, { Router, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { clientIp } from "../http/context";
import { register } from "../http/route";

/** /api/public: called from the browser by the academy's other sites (CORS in app.ts). req.ip is the visitor (nginx). */
export function publicRouter() {
  const r = Router();
  const leadLimiter = rateLimit({
    windowMs: 10 * 60_000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: { code: "RATE_LIMITED", message: "Too many attempts. Please try again in a few minutes." } },
  });
  register(r, publicRoutes.growthHubLead, leadLimiter, async (req) => {
    const { website, ...input } = req.valid.body;
    if (website) return { ok: true as const, contactUrl: null, channel: null, contactName: null };
    return { ok: true as const, ...(await captureGrowthHubLead(input)) };
  });

  // Any allowed website's form. Hand-written rather than register(): a plain HTML form post gets a redirect or a
  // page (including for invalid input and the rate limit), while fetch() callers get JSON.
  const formBody = express.urlencoded({ extended: false, limit: "64kb", parameterLimit: 100 });
  const websiteLimiter = rateLimit({
    windowMs: 10 * 60_000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (req, res, next) =>
      void respondError(
        req,
        res,
        new ApiError(429, "RATE_LIMITED", "Too many attempts. Please try again in a few minutes."),
        "rate_limited",
      ).catch(next),
  });
  r.post(publicRoutes.websiteLead.path, formBody, websiteLimiter, async (req, res, next) => {
    try {
      if (req.is("multipart/form-data"))
        throw new ApiError(415, "VALIDATION", "Send the form as application/x-www-form-urlencoded or JSON, not multipart/form-data.");
      const parsed = WebsiteLeadInput.safeParse(req.body ?? {});
      if (!parsed.success)
        throw new ApiError(400, "VALIDATION", "Please fix the highlighted fields.", fieldErrorsFromIssues(parsed.error.issues));
      const { redirect: _redirect, website, country, ...lead } = parsed.data;
      // Bots fill the hidden honeypot: they get the same answer as a person, and no lead is saved.
      if (!website)
        await submitWebsiteForm(
          { ...lead, country: country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : undefined },
          { ip: clientIp(req), origin: req.header("origin") ?? null, userAgent: req.header("user-agent") ?? null },
        );
      if (!wantsPage(req)) return void res.json({ ok: true });
      const to = await safeRedirect(req);
      if (to) return res.redirect(303, to.toString());
      res.status(200).type("html").send(page("Thank you", "We've received your details. Our team will contact you soon."));
    } catch (e) {
      if (e instanceof ApiError && e.status < 500)
        return void respondError(req, res, e, e.status === 429 ? "rate_limited" : "invalid").catch(next);
      next(e);
    }
  });
  return r;
}

/** A browser submitting an HTML form (it navigates and wants a page); fetch() and servers get JSON. */
function wantsPage(req: Request) {
  return !!req.is("application/x-www-form-urlencoded") && req.accepts(["json", "html"]) === "html";
}

/** The form's `redirect`, only when it is a page on an allowed website (never an open redirect). */
async function safeRedirect(req: Request): Promise<URL | null> {
  const raw = (req.body as { redirect?: unknown } | undefined)?.redirect;
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const u = new URL(raw.trim());
    return (u.protocol === "https:" || u.protocol === "http:") && (await allowedFormOrigins()).has(u.origin) ? u : null;
  } catch {
    return null;
  }
}

/** JSON errors keep the API's usual shape; a form post goes back to its page with ?error=… or sees a short page. */
async function respondError(req: Request, res: Response, e: ApiError, reason: "invalid" | "rate_limited") {
  e.requestId = req.requestId;
  if (!wantsPage(req)) return void res.status(e.status).json(e.toBody());
  const to = await safeRedirect(req);
  if (to) {
    to.searchParams.set("error", reason);
    return res.redirect(303, to.toString());
  }
  const detail = e.fieldErrors ? Object.values(e.fieldErrors).find(Boolean) : null;
  res
    .status(e.status)
    .type("html")
    .send(page("We couldn't send that", `${detail ?? e.message} Please go back and try again.`));
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f1f7f7;color:#021a1a;display:grid;place-items:center;min-height:100vh"><main style="max-width:28rem;padding:2rem;text-align:center"><h1 style="font-size:1.5rem;margin:0 0 .75rem">${escapeHtml(title)}</h1><p style="margin:0;line-height:1.5">${escapeHtml(body)}</p></main></body></html>`;
}
