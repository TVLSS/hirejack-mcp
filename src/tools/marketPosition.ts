import { z } from "zod";
import { apiGet, siteUrl } from "../lib/api.js";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import type { Tool } from "../registry.js";

const inputSchema = z.object({});

export const marketPositionTool: Tool = {
  name: "market_position",
  description:
    "Compute the authenticated user's market position score (0-100). Pro tier. " +
    "Weighted: 50% skill demand against current market, 20% seniority fit, " +
    "15% remote availability for the user's preference, 15% skill breadth. " +
    "Returns score, matchingJobs count, salaryMedian for matching roles, " +
    "per-skill demand breakdown, and the top companies whose tech stacks " +
    "align best with the user's skills. Use for queries like 'how do I " +
    "stack up against the market?' or 'what's my market position right now?'.",
  inputSchema,
  handler: async (_args, ctx) => {
    const deps = {
      ctx,
      citationUrl: siteUrl("/intelligence.html"),
      toolLabel: "market_position",
    };
    const auth = requireUser(deps);
    if ("error" in auth) return auth.error;
    try {
      const data = await apiGet("/market-position", {}, { authToken: auth.token });
      return proResult(data, deps.citationUrl);
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};
