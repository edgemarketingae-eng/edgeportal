import { Schema, model, type InferSchemaType, type Types } from "mongoose";

/**
 * Collections owned by Better Auth (MongoDB adapter, singular names, ObjectId ids,
 * userId stored as ObjectId). Better Auth writes them; we read them and, for staff
 * creation and the seed, write exactly the shapes it expects. strict:false keeps
 * any field Better Auth or its plugins add.
 */
const opts = { strict: false, versionKey: false, timestamps: false } as const;

const userSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    emailVerified: { type: Boolean, default: false },
    image: { type: String, default: null },
    phoneNumber: { type: String, default: null },
    phoneNumberVerified: { type: Boolean, default: false },
    twoFactorEnabled: { type: Boolean, default: false },
    disabledAt: { type: Date, default: null },
    mustChangePassword: { type: Boolean, default: false },
    timezone: { type: String, default: "Asia/Dubai" },
    createdAt: { type: Date, default: () => new Date() },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { ...opts, collection: "user" },
);
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ phoneNumber: 1 }, { unique: true, partialFilterExpression: { phoneNumber: { $type: "string" } } });

const sessionSchema = new Schema(
  {
    token: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    expiresAt: { type: Date, required: true },
    ipAddress: String,
    userAgent: String,
    createdAt: Date,
    updatedAt: Date,
  },
  { ...opts, collection: "session" },
);
sessionSchema.index({ token: 1 }, { unique: true });
sessionSchema.index({ userId: 1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const accountSchema = new Schema(
  {
    accountId: { type: String, required: true },
    providerId: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    password: String,
    createdAt: Date,
    updatedAt: Date,
  },
  { ...opts, collection: "account" },
);
accountSchema.index({ userId: 1 });
accountSchema.index({ providerId: 1, accountId: 1 });

const verificationSchema = new Schema(
  { identifier: { type: String, required: true }, value: String, expiresAt: Date, createdAt: Date, updatedAt: Date },
  { ...opts, collection: "verification" },
);
verificationSchema.index({ identifier: 1 });
verificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const twoFactorSchema = new Schema({ secret: String, backupCodes: String, userId: { type: Schema.Types.ObjectId, required: true } }, { ...opts, collection: "twoFactor" });
twoFactorSchema.index({ userId: 1 });
twoFactorSchema.index({ secret: 1 });

const rateLimitSchema = new Schema({ key: { type: String, required: true }, count: Number, lastRequest: Number }, { ...opts, collection: "rateLimit" });
rateLimitSchema.index({ key: 1 }, { unique: true });

export const AuthUser = model("AuthUser", userSchema);
export const AuthSession = model("AuthSession", sessionSchema);
export const AuthAccount = model("AuthAccount", accountSchema);
export const AuthVerification = model("AuthVerification", verificationSchema);
export const AuthTwoFactor = model("AuthTwoFactor", twoFactorSchema);
export const AuthRateLimit = model("AuthRateLimit", rateLimitSchema);

export type AuthUserDoc = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId };
