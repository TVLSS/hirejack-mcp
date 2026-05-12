import { z } from "zod";
import { apiGet, siteUrl } from "../lib/api.js";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import type { Tool } from "../registry.js";

const inputSchema = z.object({
  minPct: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Minimum % hiring growth over the trailing window (default 50)"),
  minJobs: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Minimum total open jobs to be considered (default 20, filters out tiny companies)"),
  limit: z.number().int().min(1).max(50).optional().describe("Max companies to return (default 20)"),
});

export const findBreakoutCompaniesTool: Tool = {
  name: "find_breakout_companies",
  description:
    "Companies with extreme hiring growth right now. Pro+ tier. Returns " +
    "companies whose computed trendPct exceeds the threshold (50% by " +
    "default), sorted by growth descending, with their recent monthly job " +
    "counts. Use for 'who's scaling fastest right now?' or 'find companies " +
    "doubling their hiring'. Useful for investors and recruiters tracking " +
    "momentum.",
  inputSchema,
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
