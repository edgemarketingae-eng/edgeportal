import { env, isAllowedMcpOrigin, MCP_SCOPE } from "@edge/services";
import { metadataHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/metadata.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { getOAuthProtectedResourceMetadataUrl, mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { type RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { EdgeOAuthProvider, mcpResourceUrl, type McpAuthExtra } from "./provider";
import { buildMcpServer } from "./server";

const rpcError = (code: number, message: string) => ({ jsonrpc: "2.0", error: { code, message }, id: null });

/**
 * The spec asks servers to check Origin (DNS rebinding). Claude's servers send none; browser clients (the MCP Inspector,
 * claude.ai calling directly) must come from an allowed site, and get CORS headers without credentials.
 */
const mcpOrigin: RequestHandler = (req, res, next) => {
  const origin = req.header("origin");
  if (!isAllowedMcpOrigin(origin)) return res.status(403).json(rpcError(-32000, "Origin not allowed"));
  if (origin) {
    res.vary("Origin");
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Expose-Headers", "WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version");
  }
  if (req.method !== "OPTIONS") return next();
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id");
  res.setHeader("Access-Control-Max-Age", "600");
  res.status(204).end();
};

/**
 * The Claude connector: OAuth endpoints at the API root (where the MCP SDK puts them: /authorize, /token, /register,
 * /revoke and the /.well-known documents) and the MCP endpoint itself at /mcp. Mount after express.json() and before
 * the /api/v1 gate.
 */
export function mcpRouter() {
  const provider = new EdgeOAuthProvider();
  const resourceUrl = mcpResourceUrl();
  const issuerUrl = new URL(env.API_PUBLIC_URL);
  const docsUrl = new URL(`${env.CRM_APP_URL}/docs/claude`);
  const r = express.Router();

  // claude.ai runs the sign-in in a popup it keeps a handle on; helmet's same-origin COOP would sever it.
  r.use("/authorize", (_req, res, next) => {
    res.removeHeader("Cross-Origin-Opener-Policy");
    next();
  });
  r.use(
    mcpAuthRouter({
      provider,
      issuerUrl,
      resourceServerUrl: resourceUrl,
      resourceName: "Edge Academy CRM",
      scopesSupported: [MCP_SCOPE],
      serviceDocumentationUrl: docsUrl,
      // Per IP: every claude.ai user arrives from Anthropic's servers, so these are well above the SDK defaults.
      tokenOptions: { rateLimit: { windowMs: 15 * 60_000, limit: 300 } },
      clientRegistrationOptions: { rateLimit: { windowMs: 60 * 60_000, limit: 60 } },
      authorizationOptions: { rateLimit: { windowMs: 15 * 60_000, limit: 300 } },
    }),
  );
  // Some clients look for the resource metadata at the root rather than at the path-specific address.
  r.use(
    "/.well-known/oauth-protected-resource",
    metadataHandler({
      resource: resourceUrl.href,
      authorization_servers: [issuerUrl.href],
      scopes_supported: [MCP_SCOPE],
      resource_name: "Edge Academy CRM",
      resource_documentation: docsUrl.href,
    }),
  );

  const bearer = requireBearerAuth({
    verifier: provider,
    requiredScopes: [MCP_SCOPE],
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resourceUrl),
    expectedResource: resourceUrl,
  });
  const perConnection = rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => `mcp:${(req.auth?.extra as McpAuthExtra | undefined)?.grantId}`,
    message: rpcError(-32000, "Too many requests from this Claude connection. Wait a minute."),
  });

  r.use("/mcp", mcpOrigin);
  r.post("/mcp", bearer, perConnection, async (req, res, next) => {
    try {
      const auth = req.auth!;
      const extra = auth.extra as McpAuthExtra;
      const server = buildMcpServer({ req, token: auth.token, viewer: extra.viewer, readOnly: extra.readOnly });
      // Stateless: no session id, one request in and one JSON response out (no streams for nginx to hold open).
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      next(e);
    }
  });
  // No server-to-client stream and no sessions to end in stateless mode.
  r.get("/mcp", (_req, res) => res.status(405).set("Allow", "POST").json(rpcError(-32000, "Method not allowed")));
  r.delete("/mcp", (_req, res) => res.status(405).set("Allow", "POST").json(rpcError(-32000, "Method not allowed")));
  return r;
}
