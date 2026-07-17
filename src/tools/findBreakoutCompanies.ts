import { z } from "zod";
import { apiGet, siteUrl } from "../lib/api.js";
import { envelopeSchema } from "../lib/format.js";
import { monthlyCountSchema } from "../lib/outputShapes.js";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import type { Tool } from "../registry.js";

const inputSchema = z.object({
  minPct: z.coerce
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Minimum % hiring growth over the trailing window (default 50)"),
  minJobs: z.coerce
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Minimum total open jobs to be considered (default 20, filters out tiny companies)"),
  limit: z.coerce.number().int().min(1).max(50).optional().describe("Max companies to return (1-50, default 20)"),
});

export const findBreakoutCompaniesTool: Tool = {
  name: "find_breakout_companies",
  description:
    "Companies with extreme hiring growth right now. " + "Analyst tier." + " Returns " +
    "companies whose computed trendPct exceeds the threshold (50% by " +
    "default), sorted by growth descending, with their recent monthly job " +
    "counts. Use for 'who's scaling fastest right now?' or 'find companies " +
    "doubling their hiring'. Useful for investors and recruiters tracking " +
    "momentum. Not for custom-axis segmentation by industry/family/skill — " +
    "use `find_companies` for that.",
  inputSchema,
  outputSchema: envelopeSchema(
    z
      .object({
        matched: z.number().optional().describe("Companies returned (post-threshold)"),
        minPct: z.number().optional().describe("Applied growth threshold, %"),
        minJobs: z.number().optional().describe("Applied minimum-jobs threshold"),
        companies: z
          .array(
            z
              .object({
                domain: z.string().optional().describe("Pass to get_company_profile / get_company_history / company_fit"),
                companyName: z.string().optional(),
                industry: z.string().optional(),
                totalJobs: z.number().optional(),
                trendPct: z.number().optional().describe("Hiring growth, % (2-month rolling average)"),
                hiringTrend: z.string().optional().describe("'up' | 'down' | 'stable'"),
                recentMonths: z.array(monthlyCountSchema).optional().describe("Recent monthly job counts"),
              })
              .passthrough(),
          )
          .optional()
          .describe("Breakout companies, fastest growth first"),
      })
      .passthrough(),
    "Companies whose hiring growth exceeds the threshold",
  ),
  handler: async (args, ctx) => {
    const deps = {
      ctx,
      citationUrl: siteUrl("/market/"),
      toolLabel: "find_breakout_companies",
    };
    const auth = requireUser(deps);
    if ("error" in auth) return auth.error;
    try {
      const data = await apiGet("/analyst/find-breakout", args, { authToken: auth.token });
      return proResult(data, deps.citationUrl);
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};
