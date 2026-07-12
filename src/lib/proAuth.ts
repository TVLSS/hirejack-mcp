// Shared helpers for Pro+ tools. Pro+ tools all require an authenticated
// HireJack user identity, which only the hosted HTTP transport supplies
// (via OAuth 2.1 + PKCE at https://hirejack.com/api/mcp). The stdio package
// has no auth context, so Pro+ tools surface a clear "use the hosted endpoint"
// error here. The actual JWT minting + authenticated upstream calls live in
// HireJack's hosted Lambda, not in this OSS package.

import { ApiError } from "./api.js";
import { toolError, toolResult } from "./format.js";
import type { ToolContext, ToolResponse } from "../registry.js";

export type ProToolDeps = {
  ctx: ToolContext;
  /** Where the upstream tool wants the citation pointed (passed through to
   *  toolResult); something like `https://hirejack.com/intelligence.html`. */
  citationUrl: string;
  /** Display name of the tool, used in error messages. */
  toolLabel: string;
  /** True when the tool is Premium-only (helps with the upgrade hint). */
  premium?: boolean;
  /** Tool needs only an authenticated account, not a paid tier (account-action tools). */
  anyTier?: boolean;
};

export function requireUser(deps: ProToolDeps): { error: ToolResponse } | { token: string } {
  // In stdio (this package), ctx.userId is always absent.
  // Pro+/Analyst tools require the hosted OAuth endpoint.
  if (!deps.ctx.userId) {
    const tier = deps.anyTier ? "" : deps.premium ? " Premium" : " Pro or Premium";
    return {
      error: toolError(
        `${deps.toolLabel} requires an authenticated HireJack${tier} account. ` +
          `Connect via the hosted MCP endpoint at https://hirejack.com/api/mcp ` +
          `(OAuth 2.1 + PKCE) — the stdio package only supports public tools.`,
      ),
    };
  }
  // Unreachable in stdio. The hosted Lambda transport provides its own
  // implementation that mints an internal JWT here.
  return {
    error: toolError(
      `${deps.toolLabel}: authenticated upstream calls are not supported in the ` +
        `stdio transport. Use the hosted MCP at https://hirejack.com/api/mcp.`,
    ),
  };
}

export function handleApiError(err: unknown, deps: ProToolDeps): ToolResponse {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      return toolError(
        `${deps.toolLabel}: not authenticated. The upstream HireJack API rejected the request. ` +
          `Try reconnecting this MCP client.`,
      );
    }
    if (err.status === 403) {
      const tier = deps.premium ? "Premium" : "Pro";
      return toolError(
        `${deps.toolLabel}: HireJack ${tier} tier required. Upgrade at https://hirejack.com/pricing.html.`,
      );
    }
    if (err.status === 404) {
      return toolError(`${deps.toolLabel}: ${err.message}`);
    }
    return toolError(`HireJack API error (${err.status}): ${err.message}`);
  }
  return toolError(`Unexpected error: ${(err as Error).message ?? String(err)}`);
}

/** Convenience: format a successful API payload as a tool result with a
 *  consistent envelope. */
export function proResult(data: unknown, citationUrl: string, meta?: Record<string, unknown>): ToolResponse {
  return toolResult({ data, citation_url: citationUrl, meta });
}
