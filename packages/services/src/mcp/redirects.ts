import type { McpClientKind } from "@edge/domain/mcp";
import { env } from "../env";

/** Hosts a native app (Claude Code, the MCP Inspector) listens on for its OAuth callback, on any port (RFC 8252). */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const CLAUDE_HOSTS = new Set(["claude.ai", "claude.com"]);

function parse(uri: string): URL | null {
  try {
    return new URL(uri);
  } catch {
    return null;
  }
}

const loopbackAllowed = () => env.MCP_ALLOWED_REDIRECTS.includes("loopback");
const exactRedirects = () => env.MCP_ALLOWED_REDIRECTS.filter((r) => r !== "loopback");

/** Whether Claude may send someone back to `uri` with an authorization code: MCP_ALLOWED_REDIRECTS, exactly. */
export function isAllowedRedirect(uri: string): boolean {
  const u = parse(uri);
  if (!u || u.username || u.password || u.hash) return false;
  if (u.protocol === "http:" && LOOPBACK_HOSTS.has(u.hostname)) return loopbackAllowed();
  return exactRedirects().includes(uri);
}

export function redirectKind(uri: string): McpClientKind {
  const u = parse(uri);
  if (!u) return "OTHER";
  if (LOOPBACK_HOSTS.has(u.hostname)) return "LOCAL_APP";
  if (CLAUDE_HOSTS.has(u.hostname)) return "CLAUDE_APP";
  return "OTHER";
}

/** Where the consent page says the person goes back to: "claude.ai", or "an app on this computer". */
export function returnsTo(uri: string): string {
  const u = parse(uri);
  if (!u) return "an unknown address";
  return LOOPBACK_HOSTS.has(u.hostname) ? "an app on this computer" : u.host;
}

/**
 * Browsers that may call /mcp directly (the spec asks servers to check Origin against DNS rebinding): the sites of the
 * allowed https redirects, and loopback pages when loopback is allowed. Claude's servers send no Origin at all.
 */
export function isAllowedMcpOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  const u = parse(origin);
  if (!u) return false;
  if (u.protocol === "http:" && LOOPBACK_HOSTS.has(u.hostname)) return loopbackAllowed();
  return exactRedirects().some((r) => parse(r)?.origin === u.origin);
}
