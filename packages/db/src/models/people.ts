import { Schema, model, type InferSchemaType, type Types } from "mongoose";
import { CONTACT_CHANNELS } from "@edge/domain/crm/enums";
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
    /** Optional E.164 mobile; sales executives on WhatsApp need it to receive landing page leads. */
    phone: { type: String, default: null },
    /** Telegram username without the @; sales executives on Telegram need it to receive landing page leads. */
    telegramUsername: { type: String, default: null },
    /** Where landing page visitors are sent to chat with this person. */
    contactChannel: { type: String, enum: CONTACT_CHANNELS, default: "WHATSAPP" },
    /** Off = on leave / off shift: skipped by every automatic assignment, still visible everywhere else. */
    available: { type: Boolean, default: true },
    availabilityChangedAt: { type: Date, default: null },
    bio: { type: String, default: null },
    photoUrl: { type: String, default: null },
    roleIds: { type: [ObjectId], default: [] },
    /** The current temporary password, encrypted; kept only until the person sets their own. */
    tempPasswordEnc: { type: String, default: null },
    /** Bumped whenever this person's monthly commission is re-rated, so two re-rates can't interleave. */
    commissionRev: { type: Number, default: 0 },
  },
  { ...timestamps, collection: "staffProfiles" },
);
staffProfileSchema.index({ workspaceEmail: 1 }, partialUnique("workspaceEmail"));
staffProfileSchema.index({ roleIds: 1 });

const jetaChangeSchema = new Schema(
  {
    oldValue: { type: String, default: null },
    newValue: { type: String, default: null },
    changedById: { type: ObjectId, default: null },
    changedAt: { type: Date, default: () => new Date() },
  },
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
