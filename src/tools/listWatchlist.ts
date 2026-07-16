import { z } from "zod";
import { apiGet, siteUrl } from "../lib/api.js";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import type { Tool } from "../registry.js";

// Read companion to watch_company, same pattern as list_saved_jobs /
// list_applications: any authenticated tier. watchlist_intelligence is the
// Pro-gated deep view (trends, skills, salary per company) — this is the
// plain "what am I watching?" list a free-tier user can also call.

type WatchRow = {
  domain: string;
  companyName?: string;
  followedAt?: string;
};

const inputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Max companies to return (default 50)."),
});

type Args = z.infer<typeof inputSchema>;

export const listWatchlistTool: Tool = {
  name: "list_watchlist",
  description:
    "List the companies on the authenticated user's HireJack watchlist — " +
    "the read companion to `watch_company`. Returns company name, domain " +
    "(reusable with get_company_profile/company_fit/watch_company), and " +
    "follow date. Use for 'what companies am I watching?' or before " +
    "adding/removing one. For hiring trends and stats per watched company, " +
    "use `watchlist_intelligence` (Pro).",
  inputSchema,
  annotations: { readOnlyHint: true, idempotentHint: true },
  handler: async (args: Args, ctx) => {
    const citationUrl = siteUrl("/saved.html");
    const deps = { ctx, citationUrl, toolLabel: "list_watchlist", anyTier: true };
    const auth = requireUser(deps);
    if ("error" in auth) return auth.error;
    try {
      const resp = await apiGet<{ companies?: WatchRow[] }>(
        "/watchlist",
        {},
        { authToken: auth.token },
      );
      const limit = args.limit ?? 50;
      // The endpoint returns no count field — total must be the pre-slice
      // length or a 120-company watchlist reports total: 50 (2026-07-16 review).
      const total = (resp.companies || []).length;
      const companies = (resp.companies || []).slice(0, limit).map((c) => ({
        company: c.companyName || c.domain,
        domain: c.domain,
        ...(c.followedAt ? { followed_at: c.followedAt.slice(0, 10) } : {}),
      }));
      return proResult(
        { total, returned: companies.length, companies },
        citationUrl,
      );
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};
