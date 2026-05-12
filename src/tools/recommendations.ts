import { z } from "zod";
import { apiGet, siteUrl } from "../lib/api.js";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import type { Tool } from "../registry.js";

const inputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Max recommendations to return (default 30)"),
});

export const recommendationsTool: Tool = {
  name: "recommendations",
  description:
    "Get top job recommendations for the authenticated user, scored against " +
    "their profile (skills, desired roles, seniority, location, remote " +
    "preference). Pro tier. Returns up to ~30 jobs ranked by composite " +
    "match score with per-job match details. Use for 'show me jobs that " +
    "match me' or 'what should I apply to this week?'.",
  inputSchema,
  handler: async (args, ctx) => {
    const deps = {
      ctx,
      citationUrl: siteUrl("/jobs.html?forYou=1"),
      toolLabel: "recommendations",
    };
    const auth = requireUser(deps);
    if ("error" in auth) return auth.error;
    try {
      const data = await apiGet("/recommendations", {}, { authToken: auth.token });
      return proResult(data, deps.citationUrl, { limit: args.limit ?? 30 });
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};
