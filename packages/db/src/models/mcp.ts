import { MCP_AUTH_STATUSES, MCP_CLIENT_KINDS, MCP_TOKEN_KINDS } from "@edge/domain/mcp";
import { Schema, model, type InferSchemaType, type Types } from "mongoose";
import { ObjectId, partialUnique, timestamps } from "./shared";

/**
 * Claude connector (MCP over OAuth). Claude registers itself as a client (dynamic client registration), a person approves
 * it on the CRM's consent page, and the token exchange creates a grant ("connection") with short access tokens and
 * rotating refresh tokens. Only hashes of codes and tokens are stored.
 */

/** A registered OAuth client. Public clients only (no secret): PKCE and the redirect allowlist protect the flow. */
const mcpClientSchema = new Schema(
  {
    _id: { type: String, required: true },
    /** Self-declared `client_name`: shown on the consent page as unverified. */
    name: { type: String, default: null },
    redirectUris: { type: [String], default: [] },
    /** The full registration returned to the OAuth library (never holds a secret). */
    info: { type: Schema.Types.Mixed, required: true },
    lastAuthorizedAt: { type: Date, default: null },
    /** Registrations nobody ever approves clean themselves up; cleared on the first approval. */
    unusedExpiresAt: { type: Date, default: null },
  },
  { ...timestamps, collection: "mcpClients" },
);
mcpClientSchema.index({ unusedExpiresAt: 1 }, { expireAfterSeconds: 0 });

/** One trip through the consent page, then its authorization code (kept a day after use to catch a replayed code). */
const mcpAuthRequestSchema = new Schema(
  {
    publicId: { type: String, required: true },
    clientId: { type: String, required: true },
    redirectUri: { type: String, required: true },
    state: { type: String, default: null },
    codeChallenge: { type: String, required: true },
    scopes: { type: [String], default: [] },
    resource: { type: String, default: null },
    status: { type: String, enum: MCP_AUTH_STATUSES, default: "PENDING", required: true },
    userId: { type: ObjectId, default: null },
    readOnly: { type: Boolean, default: false },
    codeHash: { type: String, default: null },
    codeExpiresAt: { type: Date, default: null },
    grantId: { type: ObjectId, default: null },
    expiresAt: { type: Date, required: true },
  },
  { ...timestamps, collection: "mcpAuthRequests" },
);
mcpAuthRequestSchema.index({ publicId: 1 }, { unique: true });
mcpAuthRequestSchema.index({ codeHash: 1 }, partialUnique("codeHash"));
mcpAuthRequestSchema.index({ userId: 1 });
mcpAuthRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** A person's Claude connection: what they see (and can disconnect) in the CRM. */
const mcpGrantSchema = new Schema(
  {
    userId: { type: ObjectId, required: true },
    clientId: { type: String, required: true },
    clientName: { type: String, default: null },
    kind: { type: String, enum: MCP_CLIENT_KINDS, default: "OTHER", required: true },
    scopes: { type: [String], default: [] },
    readOnly: { type: Boolean, default: false },
    lastUsedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null },
    revokedById: { type: ObjectId, default: null },
  },
  { ...timestamps, collection: "mcpGrants" },
);
mcpGrantSchema.index({ userId: 1, revokedAt: 1 });
mcpGrantSchema.index({ clientId: 1, userId: 1, revokedAt: 1 });
mcpGrantSchema.index({ revokedAt: 1, lastUsedAt: -1 });

const mcpTokenSchema = new Schema(
  {
    grantId: { type: ObjectId, required: true },
    userId: { type: ObjectId, required: true },
    clientId: { type: String, required: true },
    kind: { type: String, enum: MCP_TOKEN_KINDS, required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    /** A refresh token that was swapped for a new pair. Using it again (after a short grace) revokes the grant. */
    usedAt: { type: Date, default: null },
  },
  { ...timestamps, collection: "mcpTokens" },
);
mcpTokenSchema.index({ tokenHash: 1 }, { unique: true });
mcpTokenSchema.index({ grantId: 1 });
mcpTokenSchema.index({ userId: 1 });
mcpTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const McpClient = model("McpClient", mcpClientSchema);
export const McpAuthRequest = model("McpAuthRequest", mcpAuthRequestSchema);
export const McpGrant = model("McpGrant", mcpGrantSchema);
export const McpToken = model("McpToken", mcpTokenSchema);

export type McpClientDoc = InferSchemaType<typeof mcpClientSchema> & { createdAt: Date; updatedAt: Date };
export type McpAuthRequestDoc = InferSchemaType<typeof mcpAuthRequestSchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
export type McpGrantDoc = InferSchemaType<typeof mcpGrantSchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
export type McpTokenDoc = InferSchemaType<typeof mcpTokenSchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
