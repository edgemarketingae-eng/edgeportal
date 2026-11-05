import { z } from "zod";
import { zOk } from "./common";
import { route } from "./route";

/**
 * Records that can be deleted through the shared delete check. Staff deletes use the staff permissions; every other
 * type needs `records.delete`, which only the super admin role holds.
 */
export const RECORD_TYPES = [
  "staff",
  "crmStaff",
  "role",
  "student",
  "enrollment",
  "payment",
  "course",
  "batch",
  "class",
  "recording",
  "employee",
  "payRevision",
  "leave",
  "hrRequest",
  "advance",
  "payrollMonth",
  "workUpdate",
  "task",
  "taskComment",
  "leadActivity",
  "call",
  "product",
  "deposit",
] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

/** What deleting a record would do. With blockers, it can't be deleted until those are dealt with. */
export const DeletePlan = z.object({
  /** "Task Call back Amy", shown as "Delete <label>?" */
  label: z.string(),
  blockers: z.array(z.object({ message: z.string(), href: z.string().nullable() })),
  /** What goes with it, e.g. "3 comments". */
  removes: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type DeletePlan = z.infer<typeof DeletePlan>;

const recordParams = z.object({ type: z.enum(RECORD_TYPES), id: z.string().trim().min(1).max(64) });

export const recordRoutes = {
  check: route({ method: "GET", path: "/api/v1/records/:type/:id/delete-check", params: recordParams, response: DeletePlan }),
  /** The API asks for the typed confirmation too, so a stray request can't delete anything. */
  remove: route({
    method: "POST",
    path: "/api/v1/records/:type/:id/delete",
    params: recordParams,
    body: z.object({ confirm: z.literal("DELETE", { error: "Type DELETE to confirm." }) }),
    response: zOk,
  }),
};
