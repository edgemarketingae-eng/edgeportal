import { Types } from "@edge/db";
import { NotFoundError } from "./errors";

/** Parse a hex id from the outside world; invalid ids are "not found", never a cast error. */
export function oid(id: string | Types.ObjectId, what = "Resource"): Types.ObjectId {
  if (id instanceof Types.ObjectId) return id;
  if (!Types.ObjectId.isValid(id) || String(id).length !== 24) throw new NotFoundError(what);
  return new Types.ObjectId(id);
}

export const hex = (id: Types.ObjectId | string | null | undefined) => (id == null ? null : String(id));
