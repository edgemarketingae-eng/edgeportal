import { Schema, model, type InferSchemaType, type Types } from "mongoose";
import { ObjectId, timestamps } from "./shared";

/** A stored file. The bytes live with the storage provider; this row is what access checks read. */
const fileAssetSchema = new Schema(
  {
    /** The app module and its area: they make the storage folder, e.g. hr + leave. */
    module: { type: String, required: true },
    area: { type: String, required: true },
    publicId: { type: String, required: true },
    resourceType: { type: String, required: true },
    format: { type: String, default: null },
    bytes: { type: Number, required: true },
    originalName: { type: String, required: true },
    contentType: { type: String, required: true },
    uploadedById: { type: ObjectId, required: true },
    /** The person the file is about. They can always read it. */
    ownerId: { type: ObjectId, default: null },
    /** Set when a feature claims the upload. Unclaimed files are deleted by the sweep job. */
    linkedType: { type: String, default: null },
    linkedId: { type: ObjectId, default: null },
    linkedAt: { type: Date, default: null },
  },
  { ...timestamps, collection: "fileAssets" },
);
fileAssetSchema.index({ linkedAt: 1, createdAt: 1 });
fileAssetSchema.index({ linkedType: 1, linkedId: 1 });

export const FileAsset = model("FileAsset", fileAssetSchema);
export type FileAssetDoc = InferSchemaType<typeof fileAssetSchema> & { _id: Types.ObjectId };
