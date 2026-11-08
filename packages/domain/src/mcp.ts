/** Claude connector (MCP over OAuth) enums, shared by the models, contracts and UI. */
export const MCP_AUTH_STATUSES = ["PENDING", "APPROVED", "DENIED", "USED"] as const;
export const MCP_TOKEN_KINDS = ["ACCESS", "REFRESH"] as const;
/** Where a connection returns to: Claude's own apps (claude.ai / claude.com), an app on the person's computer, or anything else allowed. */
export const MCP_CLIENT_KINDS = ["CLAUDE_APP", "LOCAL_APP", "OTHER"] as const;
export type McpClientKind = (typeof MCP_CLIENT_KINDS)[number];

/** Prefixes make Claude tokens recognisable at a glance (and to secret scanners). */
export const MCP_ACCESS_PREFIX = "edge_mcp_at_";
export const MCP_REFRESH_PREFIX = "edge_mcp_rt_";
export const MCP_CODE_PREFIX = "edge_mcp_code_";

export const isMcpAccessToken = (token: string) => token.startsWith(MCP_ACCESS_PREFIX);
