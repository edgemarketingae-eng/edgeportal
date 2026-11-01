import { FileAsset, Types, type FileAssetDoc } from "@edge/db";
import { now } from "@edge/domain/clock";
import type { Actor } from "@edge/domain/enums";
import { ALLOWED_FILE_TYPES, detectFileType, isFileArea, MAX_FILE_BYTES } from "@edge/domain/files";
import { env } from "../env";
import { BusinessError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { oid } from "../ids";
import { runtime } from "../runtime";

const DAY_MS = 86_400_000;
/** Areas holding what HR issues about a person. Everyone else can only upload their own leave and request attachments. */
const HR_ONLY_AREAS = new Set(["letters", "documents"]);

const safeName = (name: string) => name.replace(/[^\w.\- ()]+/g, "_").slice(-120) || "file";

export interface FileViewer {
  userId: string;
  hrManage: boolean;
}

/** Checks the size and the real file type, then stores the bytes. The row stays unclaimed until a feature links it. */
export async function uploadFile(
  input: { module: string; area: string; name: string; bytes: Uint8Array; ownerId?: string },
  viewer: FileViewer,
) {
  if (!isFileArea(input.module, input.area)) throw new ValidationError({ file: "This upload isn't allowed here" });
  if (HR_ONLY_AREAS.has(input.area) && !viewer.hrManage) throw new ForbiddenError();
  if (!input.bytes.length) throw new ValidationError({ file: "This file is empty" });
  if (input.bytes.length > MAX_FILE_BYTES) throw new ValidationError({ file: `Files can be up to ${MAX_FILE_BYTES / (1024 * 1024)} MB` });
  const type = detectFileType(input.bytes);
  if (!type) throw new ValidationError({ file: `Upload a ${ALLOWED_FILE_TYPES} file` });
  const folder = `${env.CLOUDINARY_ROOT_FOLDER}/${input.module}/${input.area}`;
  const stored = await runtime().files.upload({ bytes: input.bytes, folder, format: type.format });
  const [row] = await FileAsset.create([
    {
      module: input.module,
      area: input.area,
      publicId: stored.publicId,
      resourceType: stored.resourceType,
      format: stored.format,
      bytes: stored.bytes,
      originalName: safeName(input.name),
      contentType: type.contentType,
      uploadedById: new Types.ObjectId(viewer.userId),
      ownerId: viewer.hrManage && input.ownerId ? oid(input.ownerId) : new Types.ObjectId(viewer.userId),
    },
  ]);
  return { id: String(row!._id), name: row!.originalName };
}

/** Inside withTx: link an upload to what it belongs to. Only the person who uploaded it can, and only once. */
export async function claimFile(
  id: string,
  actor: Actor & { type: "USER" },
  link: { linkedType: string; linkedId: Types.ObjectId; ownerId?: Types.ObjectId },
) {
  const set = await FileAsset.updateOne(
    { _id: oid(id, "File"), uploadedById: new Types.ObjectId(actor.id), linkedAt: null },
    { $set: { linkedType: link.linkedType, linkedId: link.linkedId, linkedAt: now(), ...(link.ownerId ? { ownerId: link.ownerId } : {}) } },
  );
  if (set.modifiedCount !== 1) throw new BusinessError("That file is no longer available. Please upload it again.");
}

/** The bytes, once the viewer may see them: its owner, its uploader, or HR. 404, not 403, so ids can't be probed. */
export async function readFile(id: string, viewer: FileViewer) {
  const f = (await FileAsset.findById(oid(id, "File")).lean()) as FileAssetDoc | null;
  const mine = f && (String(f.ownerId) === viewer.userId || String(f.uploadedById) === viewer.userId);
  if (!f || (!mine && !viewer.hrManage)) throw new NotFoundError("File");
  const bytes = await runtime().files.read({ publicId: f.publicId, resourceType: f.resourceType, format: f.format ?? null });
  return { bytes, contentType: f.contentType, name: f.originalName };
}

export async function deleteFile(id: string) {
  const f = (await FileAsset.findById(oid(id, "File")).lean()) as FileAssetDoc | null;
  if (!f) throw new NotFoundError("File");
  await runtime().files.delete({ publicId: f.publicId, resourceType: f.resourceType, format: f.format ?? null });
  await FileAsset.deleteOne({ _id: f._id });
}

/** Uploads nobody claimed (a form that failed after the upload). Provider calls stay outside transactions, which can rerun. */
export async function sweepOrphanFiles(at: Date = now()) {
  const rows = (await FileAsset.find({ linkedAt: null, createdAt: { $lt: new Date(at.getTime() - DAY_MS) } })
    .limit(200)
    .lean()) as FileAssetDoc[];
  for (const f of rows) {
    await runtime().files.delete({ publicId: f.publicId, resourceType: f.resourceType, format: f.format ?? null });
    await FileAsset.deleteOne({ _id: f._id, linkedAt: null });
  }
  return { deleted: rows.length };
}
