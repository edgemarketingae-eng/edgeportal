import { Schema, model, type InferSchemaType, type Types } from "mongoose";
import { ObjectId, partialUnique, timestamps } from "./shared";

const roleSchema = new Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: null },
    permissions: { type: [String], default: [] },
    isSystem: { type: Boolean, default: false },
  },
  { ...timestamps, collection: "roles" },
);
roleSchema.index({ key: 1 }, { unique: true });

/** _id = the Better Auth user id. Replaces the UserRole join with roleIds[]. */
const staffProfileSchema = new Schema(
  {
    _id: { type: ObjectId, required: true },
    title: { type: String, default: null },
    workspaceEmail: { type: String, default: null },
    bio: { type: String, default: null },
    photoUrl: { type: String, default: null },
    roleIds: { type: [ObjectId], default: [] },
  },
  { ...timestamps, collection: "staffProfiles" },
);
staffProfileSchema.index({ workspaceEmail: 1 }, partialUnique("workspaceEmail"));
staffProfileSchema.index({ roleIds: 1 });

const jetaChangeSchema = new Schema(
  { oldValue: { type: String, default: null }, newValue: { type: String, default: null }, changedById: { type: ObjectId, default: null }, changedAt: { type: Date, default: () => new Date() } },
  { _id: false },
);

/** _id = the Better Auth user id. */
const studentProfileSchema = new Schema(
  {
    _id: { type: ObjectId, required: true },
    country: { type: String, default: "AE" },
    pendingPhone: { type: String, default: null },
    jetaFxClientId: { type: String, default: null },
    jetaFxHistory: { type: [jetaChangeSchema], default: [] },
    marketingConsent: { type: Boolean, default: false },
    marketingConsentAt: { type: Date, default: null },
    odooPartnerId: { type: Number, default: null },
    mailerliteSubscriberId: { type: String, default: null },
    referralCode: { type: String, default: null },
  },
  { ...timestamps, collection: "studentProfiles" },
);
studentProfileSchema.index({ referralCode: 1 }, partialUnique("referralCode"));
studentProfileSchema.index({ jetaFxClientId: 1 });
studentProfileSchema.index({ createdAt: -1 });

export const Role = model("Role", roleSchema);
export const StaffProfile = model("StaffProfile", staffProfileSchema);
export const StudentProfile = model("StudentProfile", studentProfileSchema);

export type RoleDoc = InferSchemaType<typeof roleSchema> & { _id: Types.ObjectId };
export type StaffProfileDoc = InferSchemaType<typeof staffProfileSchema>;
export type StudentProfileDoc = InferSchemaType<typeof studentProfileSchema>;
