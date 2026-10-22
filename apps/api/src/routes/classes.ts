import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { classRoutes } from "@edge/contracts";
import {
  addRecordingFromDrive,
  cancelClass,
  env,
  getManageClasses,
  getManageRecordings,
  getStaffOverview,
  getWatch,
  isClassStaff,
  listStudentClasses,
  listStudentRecordings,
  loadViewer,
  markCacheMissing,
  parseRange,
  recordingForStream,
  requestCacheFill,
  rescheduleClass,
  resolveJoin,
  runtime,
  scheduleClass,
  setRecordingStatus,
  studentEntitlements,
  touchServed,
  verifyMediaToken,
} from "@edge/services";
import { fromNodeHeaders } from "better-auth/node";
import { Router, type Request, type Response } from "express";
import type { Auth } from "../auth";
import { clientIp } from "../http/context";
import { actorOf, requireAnyPermission, requireStudent } from "../http/guards";
import { register } from "../http/route";

/** Mentors (staff portal) and admins with the class/recording permission (admin panel) share these routes. */
const classStaff = (req: Request) => requireAnyPermission(req, "staff.access", "class.schedule.any");
const recordingStaff = (req: Request) => requireAnyPermission(req, "staff.access", "recording.manage");

export function classesRouter() {
  const r = Router();
  register(r, classRoutes.studentClasses, async (req) => listStudentClasses(await studentEntitlements(requireStudent(req).userId)));
  register(r, classRoutes.studentRecordings, async (req) => listStudentRecordings(await studentEntitlements(requireStudent(req).userId)));
  register(r, classRoutes.watch, async (req) => {
    const v = requireStudent(req);
    return getWatch(req.valid.params.id, v.userId, await studentEntitlements(v.userId), { ip: clientIp(req), userAgent: req.header("x-forwarded-user-agent") ?? req.header("user-agent") ?? null });
  });

  register(r, classRoutes.staffOverview, async (req) => getStaffOverview(classStaff(req).userId));
  register(r, classRoutes.manageClasses, async (req) => getManageClasses(classStaff(req).userId));
  register(r, classRoutes.schedule, async (req) => scheduleClass(req.valid.body, actorOf(classStaff(req))));
  register(r, classRoutes.reschedule, async (req) => {
    await rescheduleClass(req.valid.params.id, req.valid.body, actorOf(classStaff(req)));
    return { ok: true as const, message: "Class updated." };
  });
  register(r, classRoutes.cancel, async (req) => {
    await cancelClass(req.valid.params.id, req.valid.body.reason, req.valid.body.notify, actorOf(classStaff(req)));
    return { ok: true as const, message: "Class cancelled." };
  });
  register(r, classRoutes.manageRecordings, async (req) => getManageRecordings(recordingStaff(req).userId));
  register(r, classRoutes.addRecording, async (req) => addRecordingFromDrive(req.valid.body, actorOf(recordingStaff(req))));
  register(r, classRoutes.setRecordingStatus, async (req) => {
    await setRecordingStatus(req.valid.params.id, req.valid.body.status, actorOf(recordingStaff(req)));
    return { ok: true as const };
  });
  return r;
}

const MEDIA_HEADERS = {
  "Accept-Ranges": "bytes",
  "Cache-Control": "private, no-store",
  "Content-Disposition": "inline",
  "X-Content-Type-Options": "nosniff",
  // The <video> element lives on the student app's origin; the bytes come from the API host.
  "Cross-Origin-Resource-Policy": "cross-origin",
};

/**
 * Public, token-gated recording stream with HTTP Range support. Serves from the local disk cache
 * when it is filled; otherwise proxies Drive for this request and asks the worker to fill the cache.
 */
export function mediaRouter() {
  const r = Router();
  r.get("/api/media/recordings/:id", async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const token = typeof req.query.t === "string" ? req.query.t : "";
    if (!verifyMediaToken(id, token)) return res.status(403).type("text/plain").send("Link expired. Reload the page.");
    const rec = await recordingForStream(id);
    if (!rec) return res.status(404).type("text/plain").send("Not found");
    await touchServed(id);

    const range = req.header("range") ?? null;
    if (rec.cache?.state === "READY" && rec.cache.path) {
      try {
        const { size } = await stat(rec.cache.path);
        const parsed = parseRange(range, size);
        if (parsed === "invalid") return res.status(416).set({ ...MEDIA_HEADERS, "Content-Range": `bytes */${size}` }).end();
        const start = parsed?.start ?? 0;
        const end = parsed?.end ?? size - 1;
        res.status(parsed ? 206 : 200).set({
          ...MEDIA_HEADERS,
          "Content-Type": rec.mimeType ?? "video/mp4",
          "Content-Length": String(end - start + 1),
          ...(parsed ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
        });
        if (req.method === "HEAD") return res.end();
        return await pipeline(createReadStream(rec.cache.path, { start, end }), res).catch(() => undefined); // viewer seeked or closed the tab
      } catch {
        await markCacheMissing(id);
      }
    }

    await requestCacheFill(id);
    try {
      const dl = await runtime().google.downloadDriveFile(rec.driveAccessEmail ?? env.GOOGLE_DEFAULT_ORGANIZER ?? "", rec.driveFileId, range);
      res.status(dl.status).set({
        ...MEDIA_HEADERS,
        "Content-Type": dl.headers.contentType ?? rec.mimeType ?? "video/mp4",
        ...(dl.headers.contentLength ? { "Content-Length": dl.headers.contentLength } : {}),
        ...(dl.headers.contentRange ? { "Content-Range": dl.headers.contentRange } : {}),
      });
      if (req.method === "HEAD" || !dl.body) return res.end();
      await pipeline(Readable.fromWeb(dl.body as never), res).catch(() => undefined);
    } catch (e) {
      req.log?.error({ err: e, recordingId: id }, "drive proxy failed");
      if (!res.headersSent) res.status(503).set("Retry-After", "120").type("text/plain").send("This recording is being prepared. Please try again in a few minutes.");
    }
  });
  return r;
}

/**
 * Browser route (through either app's rewrite): the real Meet URL is never rendered in a page.
 * Students are checked against entitlements and the join window; staff of the class skip both.
 */
export function joinRouter(auth: Auth) {
  const r = Router();
  r.get("/api/join/:sessionId", async (req, res, next) => {
    try {
      const sessionId = String(req.params.sessionId);
      const fromConsole = req.header("x-forwarded-host") === new URL(env.CONSOLE_APP_URL).host;
      const back = (error: string) => res.redirect(302, `${fromConsole ? "/staff/classes" : "/classes"}?error=${error}`);

      const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers), query: { disableRefresh: true } });
      const viewer = session ? await loadViewer(session.user.id) : null;
      if (!viewer || viewer.user.disabledAt) return res.redirect(302, `/login?next=${encodeURIComponent(req.originalUrl)}`);

      const isStaff = !!viewer.staff && (await isClassStaff(viewer.userId, sessionId));
      const ent = !isStaff && viewer.student ? await studentEntitlements(viewer.userId) : null;
      const out = await resolveJoin(sessionId, viewer.userId, ent, isStaff, clientIp(req));
      if (!out.url) return back(out.error ?? "unavailable");
      res.redirect(302, out.url);
    } catch (e) {
      next(e);
    }
  });
  return r;
}
