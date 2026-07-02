import { z } from "zod";
import { apiGet, siteUrl } from "../lib/api.js";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import type { Tool } from "../registry.js";

const inputSchema = z.object({
  domains: z
    .array(z.string().min(1))
    .min(1)
    .max(5)
    .describe(
      "Up to 5 company domains to compare side-by-side (e.g. " +
        "['stripe.com', 'plaid.com', 'adyen.com'])",
    ),
  months: z.coerce
    .number()
    .int()
    .min(1)
    .max(12)
    .optional()
    .describe("Months of history per company (default 6, max 12)"),
});

export const compareCompaniesTool: Tool = {
  name: "compare_companies",
  description:
    "Compare hiring profiles of multiple companies side-by-side. Analyst tier. " +
    "tier. Returns per-company current state (totalJobs, medianSalary, " +
    "trend, top skills) plus monthly snapshot history for the chosen " +
    "window. Up to 5 companies. Use for 'compare hiring at Stripe vs " +
    "Plaid vs Adyen' or 'which of these is growing fastest?'.",
  inputSchema,
  handler: async (args, ctx) => {
    const deps = {
      ctx,
      citationUrl: siteUrl(`/compare?d=${args.domains.join(",")}`),
      toolLabel: "compare_companies",
    };
    const auth = requireUser(deps);
    if ("error" in auth) return auth.error;
    try {
      const data = await apiGet(
        "/analyst/compare",
        { domains: args.domains.join(","), months: args.months },
        { authToken: auth.token },
      );
      return proResult(data, deps.citationUrl);
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};
