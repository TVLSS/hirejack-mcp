import { z } from "zod";
import { apiGet, apiPost, siteUrl } from "../lib/api.js";
import { toolError } from "../lib/format.js";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import type { Tool } from "../registry.js";

// Explicit follow/unfollow over the website's toggle endpoint — checks the
// current watchlist first so retries are idempotent.

const inputSchema = z.object({
  domain: z
    .string()
    .min(1)
    .describe("Company domain to watch, e.g. 'stripe.com'. Find domains via `search_companies`."),
  action: z
    .enum(["follow", "unfollow"])
    .optional()
    .describe("Default 'follow'. 'unfollow' removes the company from the watchlist."),
});

type Args = z.infer<typeof inputSchema>;

export const watchCompanyTool: Tool = {
  name: "watch_company",
  description:
    "Add a company to the authenticated user's watchlist on HireJack (or " +
    "remove it with action='unfollow'). Watched companies power " +
    "`watchlist_intelligence`, daily job alerts, and the weekly digest. " +
    "Idempotent — following an already-watched company is a no-op. Use when " +
    "the user says 'watch this company', 'follow Stripe for me', or 'stop " +
    "watching them'.",
  inputSchema,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async (args: Args, ctx) => {
    const action = args.action ?? "follow";
    const deps = {
      ctx,
      citationUrl: siteUrl(`/companies/${args.domain}/`),
      toolLabel: "watch_company",
      anyTier: true,
    };
    const auth = requireUser(deps);
    if ("error" in auth) return auth.error;
    try {
      const list = await apiGet<{ companies?: { domain: string }[] }>(
        "/watchlist",
        {},
        { authToken: auth.token },
      );
      const currentlyFollowing = (list.companies || []).some((c) => c.domain === args.domain);
      const wantFollowing = action === "follow";

      if (currentlyFollowing === wantFollowing) {
        return proResult(
          { following: currentlyFollowing, changed: false, domain: args.domain },
          deps.citationUrl,
          { note: wantFollowing ? "Already watching — no change." : "Not on watchlist — no change." },
        );
      }

      const result = await apiPost<{ following: boolean; companyName?: string }>(
        "/watchlist",
        { domain: args.domain },
        { authToken: auth.token },
      );
      return proResult(
        { following: result.following, changed: true, domain: args.domain, company: result.companyName },
        deps.citationUrl,
      );
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};
