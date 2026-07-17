import { z } from "zod";
import { apiGet, siteUrl } from "../lib/api.js";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import type { Tool } from "../registry.js";

const inputSchema = z.object({});

export const skillGapTool: Tool = {
  name: "skill_gap",
  description:
    "Analyze the gap between the authenticated user's current skills and " +
    "what their desired roles require in the live market. " + "Pro tier." + " Returns " +
    "matchPct (0-100), the list of skills the user already has that map to " +
    "their target roles, and the list of missing skills ranked by impact " +
    "(how often the skill appears in target-role postings). Use for 'what " +
    "should I learn next?' or 'how close am I to senior PM roles?'. Not for " +
    "simulating the payoff of skills the user might LEARN — use " +
    "`skill_impact` for that.",
  inputSchema,
  handler: async (_args, ctx) => {
    const deps = {
      ctx,
      citationUrl: siteUrl("/intelligence.html"),
      toolLabel: "skill_gap",
    };
    const auth = requireUser(deps);
    if ("error" in auth) return auth.error;
    try {
      const data = await apiGet("/skill-gap", {}, { authToken: auth.token });
      return proResult(data, deps.citationUrl);
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};
