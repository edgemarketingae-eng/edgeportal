import { readFile, uploadFile } from "@edge/services";
import express, { Router, type Request } from "express";
import { requireStaffUser } from "../http/guards";

/** Slightly above the 5 MB file limit, so an oversized file gets the friendly size message from the service. */
const RAW_LIMIT = "6mb";

function viewer(req: Request) {
  const v = requireStaffUser(req);
  return { userId: v.userId, hrManage: v.permissions.has("hr.manage") };
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Internal (Next.js server) file routes. They carry raw bytes, so they sit outside the JSON contract routes. */
export function filesRouter() {
  const r = Router();

  r.post("/api/v1/files", express.raw({ type: "application/octet-stream", limit: RAW_LIMIT }), async (req, res, next) => {
    try {
      const v = viewer(req);
      const bytes = Buffer.isBuffer(req.body) ? new Uint8Array(req.body) : new Uint8Array();
      const ownerId = str(req.query.ownerId) || undefined;
      res.json(
        await uploadFile({ module: str(req.query.module), area: str(req.query.area), name: str(req.query.name), bytes, ownerId }, v),
      );
    } catch (e) {
      next(e);
    }
  });

  r.get("/api/v1/files/:id", async (req, res, next) => {
    try {
      const f = await readFile(req.params.id, viewer(req));
      res.setHeader("content-type", f.contentType);
      res.setHeader("content-disposition", `inline; filename="${f.name.replace(/"/g, "")}"`);
      res.setHeader("x-content-type-options", "nosniff");
      res.setHeader("cache-control", "private, no-store");
      res.send(Buffer.from(f.bytes));
    } catch (e) {
      next(e);
    }
  });

  return r;
}
