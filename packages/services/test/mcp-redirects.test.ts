import { describe, expect, it } from "vitest";
import { isAllowedMcpOrigin, isAllowedRedirect, redirectKind, returnsTo } from "../src/mcp/redirects";

describe("Claude connector redirect allowlist", () => {
  it("allows Claude's own callbacks exactly", () => {
    expect(isAllowedRedirect("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(isAllowedRedirect("https://claude.com/api/mcp/auth_callback")).toBe(true);
    for (const bad of [
      "https://claude.ai/api/mcp/auth_callback/",
      "https://claude.ai/api/mcp/auth_callback?x=1",
      "https://claude.ai/api/mcp/auth_callback#frag",
      "http://claude.ai/api/mcp/auth_callback",
      "https://claude.ai.evil.example/api/mcp/auth_callback",
      "https://user@claude.ai/api/mcp/auth_callback",
    ])
      expect(isAllowedRedirect(bad), bad).toBe(false);
  });

  it("allows apps on this computer on any port, over http only", () => {
    for (const ok of [
      "http://localhost:33418/callback",
      "http://127.0.0.1:6274/oauth/callback",
      "http://[::1]:9000/cb",
      "http://localhost/cb",
    ])
      expect(isAllowedRedirect(ok), ok).toBe(true);
    for (const bad of [
      "https://localhost:8443/cb",
      "http://localhost.evil.example/cb",
      "http://10.0.0.5:8080/cb",
      "not a url",
      "javascript:alert(1)",
    ])
      expect(isAllowedRedirect(bad), bad).toBe(false);
  });

  it("names where a person goes back to", () => {
    expect(redirectKind("https://claude.ai/api/mcp/auth_callback")).toBe("CLAUDE_APP");
    expect(redirectKind("http://localhost:1/cb")).toBe("LOCAL_APP");
    expect(returnsTo("https://claude.ai/api/mcp/auth_callback")).toBe("claude.ai");
    expect(returnsTo("http://127.0.0.1:5000/cb")).toBe("an app on this computer");
  });

  it("checks browser origins calling /mcp", () => {
    expect(isAllowedMcpOrigin(undefined)).toBe(true);
    expect(isAllowedMcpOrigin("https://claude.ai")).toBe(true);
    expect(isAllowedMcpOrigin("http://localhost:6274")).toBe(true);
    expect(isAllowedMcpOrigin("https://evil.example")).toBe(false);
  });
});
