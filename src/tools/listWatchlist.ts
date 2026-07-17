import { z } from "zod";
import { apiGet, siteUrl } from "../lib/api.js";
import { envelopeSchema } from "../lib/format.js";
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
    .describe("Max companies to return (1-100, default 50)."),
});

type Args = z.infer<typeof inputSchema>;

export const listWatchlistTool: Tool = {
  name: "list_watchlist",
  description:
    "List the companies on the authenticated user's HireJack watchlist — " +
    "the read companion to `watch_company`. Returns company name, domain " +
    "(reusable with get_company_profile/company_fit/watch_company), and " +
    "follow date. Use for 'what companies am I watching?' or before " +
    "adding/removing one. Not for per-company hiring trends and stats — " +
    "use `watchlist_intelligence` (Pro) for that.",
  inputSchema,
  outputSchema: envelopeSchema(
    z
      .object({
        total: z.number().optional().describe("Total companies on the watchlist"),
        returned: z.number().optional().describe("Companies in this response (after limit)"),
        companies: z
          .array(
            z
              .object({
                company: z.string().optional().describe("Display name (falls back to the domain)"),
                domain: z.string().optional().describe("Pass to get_company_profile / company_fit / watch_company"),
                followed_at: z.string().optional().describe("YYYY-MM-DD"),
              })
              .passthrough(),
          )
          .optional(),
      })
      .passthrough(),
    "Companies on the user's watchlist",
  ),
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
