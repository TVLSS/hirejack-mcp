import { z } from "zod";
import { apiGet, siteUrl } from "../lib/api.js";
import { envelopeSchema } from "../lib/format.js";
import { companyCurrentStateSchema, companyMonthlySnapshotSchema, monthlyCountSchema } from "../lib/outputShapes.js";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import type { Tool } from "../registry.js";

const inputSchema = z.object({
  domain: z.string().min(1).describe("Company domain (e.g. 'stripe.com')"),
  months: z
    .number()
    .int()
    .min(1)
    .max(24)
    .optional()
    .describe(
      "Months of history to return (default 12, max 24). Note: detailed " +
        "monthly snapshots only began March 2026, so depth is currently " +
        "capped by available history.",
    ),
});

export const getCompanyHistoryTool: Tool = {
  name: "get_company_history",
  description:
    "Time-series of a company's hiring profile. " + "Analyst tier." + " Returns monthly " +
    "snapshots (totalJobs, engineeringJobs, medianSalary, hiringTrend, " +
    "trendPct, top skills, seniority + family distribution) plus the wider " +
    "monthlyPostings job-count series and current-state summary. Use for " +
    "'how has Anthropic's hiring changed since January?' or 'is Stripe " +
    "growing or shrinking?'. Not for a current-state snapshot " +
    "(`get_company_profile`) or side-by-side comparison " +
    "(`compare_companies`).",
  inputSchema,
  outputSchema: envelopeSchema(
    z
      .object({
        domain: z.string().optional(),
        companyName: z.string().optional(),
        industry: z.string().optional(),
        current: companyCurrentStateSchema.optional(),
        monthlyPostings: z
          .array(monthlyCountSchema)
          .optional()
          .describe("Wider job-count series derived from currently-live jobs (older months under-count expired listings)"),
        snapshots: z.array(companyMonthlySnapshotSchema).optional().describe("Detailed monthly snapshots, oldest first"),
        note: z.string().optional().describe("Present when fewer snapshot months exist than requested"),
      })
      .passthrough(),
    "Monthly hiring history plus current state for one company",
  ),
  handler: async (args, ctx) => {
    const deps = {
      ctx,
      citationUrl: siteUrl(`/companies/${args.domain}/`),
      toolLabel: "get_company_history",
      analyst: true,
    };
    const auth = requireUser(deps);
    if ("error" in auth) return auth.error;
    try {
      const data = await apiGet("/analyst/history/company", args, { authToken: auth.token });
      return proResult(data, deps.citationUrl);
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};
