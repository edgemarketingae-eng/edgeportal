import {
  challengeForMcpCode,
  env,
  exchangeMcpCode,
  getMcpClient,
  loadViewer,
  MCP_SCOPE,
  McpOAuthError,
  refreshMcpTokens,
  registerMcpClient,
  revokeMcpToken,
  startMcpAuthorization,
  verifyMcpAccess,
  type Viewer,
} from "@edge/services";
import type { AuthorizationParams, OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import {
  InvalidClientMetadataError,
  InvalidGrantError,
  InvalidRequestError,
  InvalidTargetError,
  InvalidTokenError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { OAuthClientInformationFull, OAuthTokenRevocationRequest, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { Response } from "express";

/** Our errors → the OAuth library's, which it turns into the standard error responses. */
async function oauth<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!(e instanceof McpOAuthError)) throw e;
    if (e.code === "invalid_client_metadata") throw new InvalidClientMetadataError(e.message);
    if (e.code === "invalid_grant") throw new InvalidGrantError(e.message);
    if (e.code === "invalid_target") throw new InvalidTargetError(e.message);
    throw new InvalidRequestError(e.message);
  }
}

/** The connector's address, e.g. https://api.edgeacademy.ae/mcp: what tokens are issued for. */
export const mcpResourceUrl = () => new URL(`${env.API_PUBLIC_URL.replace(/\/+$/, "")}/mcp`);

const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);
/** In development, http://127.0.0.1:4000/mcp and http://localhost:4000/mcp are the same server. */
function sameResource(given: URL) {
  const ours = mcpResourceUrl();
  const strip = (u: URL) => `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}`;
  if (strip(given) === strip(ours)) return true;
  return (
    env.NODE_ENV !== "production" &&
    LOCAL.has(given.hostname) &&
    LOCAL.has(ours.hostname) &&
    given.port === ours.port &&
    given.pathname.replace(/\/+$/, "") === ours.pathname
  );
}

export interface McpAuthExtra extends Record<string, unknown> {
  userId: string;
  grantId: string;
  readOnly: boolean;
  viewer: Viewer;
}

/**
 * The OAuth authorization server behind the Claude connector, on the API host. Claude registers itself, sends the person
 * here, and we send them on to the CRM's consent page (where they sign in as usual); Allow there issues the code.
 */
export class EdgeOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: OAuthRegisteredClientsStore = {
    getClient: async (clientId) => (await getMcpClient(clientId)) as OAuthClientInformationFull | undefined,
    registerClient: (client) => oauth(() => registerMcpClient(client as OAuthClientInformationFull & { redirect_uris: string[] })),
  };

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    if (params.resource && !sameResource(params.resource))
      throw new InvalidTargetError("This server only issues tokens for its /mcp endpoint");
    const id = await oauth(() =>
      startMcpAuthorization({
        clientId: client.client_id,
        redirectUri: params.redirectUri,
        state: params.state,
        codeChallenge: params.codeChallenge,
        scopes: params.scopes,
        resource: params.resource?.href,
      }),
    );
    res.redirect(302, `${env.CRM_APP_URL}/connect?request=${encodeURIComponent(id)}`);
  }

  challengeForAuthorizationCode(client: OAuthClientInformationFull, code: string): Promise<string> {
    return oauth(() => challengeForMcpCode(client.client_id, code));
  }

  exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
    _verifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    if (resource && !sameResource(resource)) throw new InvalidTargetError("This server only issues tokens for its /mcp endpoint");
    return oauth(() => exchangeMcpCode({ clientId: client.client_id, code, redirectUri }));
  }

  exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string, _scopes?: string[], resource?: URL): Promise<OAuthTokens> {
    if (resource && !sameResource(resource)) throw new InvalidTargetError("This server only issues tokens for its /mcp endpoint");
    return oauth(() => refreshMcpTokens({ clientId: client.client_id, refreshToken }));
  }

  async revokeToken(client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    await revokeMcpToken({ clientId: client.client_id, token: request.token });
  }

  /** Every failure is "invalid token" (401), which is what tells Claude to reconnect. */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const access = await verifyMcpAccess(token);
    if (access === "off") throw new InvalidTokenError("Claude access to the Edge CRM is turned off by your CRM admin");
    if (!access) throw new InvalidTokenError("Invalid or expired token");
    const viewer = await loadViewer(access.userId);
    if (!viewer || viewer.user.disabledAt || !viewer.permissions.has("crm.access"))
      throw new InvalidTokenError("This account can't use the CRM");
    const extra: McpAuthExtra = { userId: access.userId, grantId: access.grantId, readOnly: access.readOnly, viewer };
    return {
      token,
      clientId: access.clientId,
      scopes: access.scopes.length ? access.scopes : [MCP_SCOPE],
      expiresAt: Math.floor(access.expiresAt.getTime() / 1000),
      resource: mcpResourceUrl(),
      extra,
    };
  }
}
