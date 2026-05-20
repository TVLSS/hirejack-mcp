import { z } from "zod";
import { apiGet, siteUrl } from "../lib/api.js";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import type { Tool } from "../registry.js";

const inputSchema = z.object({});

export const watchlistIntelligenceTool: Tool = {
  name: "watchlist_intelligence",
  description:
    "Aggregate hiring intelligence on every company the authenticated user " +
    "is watching. Pro tier. For each watched company returns: " +
    "totalJobs currently open, hiringTrend (up/down/stable), trendPct " +
    "(week-over-week %), topSkills the company is hiring for, medianSalary, " +
    "sparkline data (last ~12 weeks of job counts), and jobDelta since the " +
    "previous snapshot. Use for queries like 'what's happening at the " +
    "companies I'm watching?' or 'which of my watched companies are scaling " +
    "up right now?'.",
  inputSchema,
  handler: async (_args, ctx) => {
    const deps = {
      ctx,
      citationUrl: siteUrl("/saved.html#watchlist"),
      toolLabel: "watchlist_intelligence",
    };
    const auth = requireUser(deps);
    if ("error" in auth) return auth.error;
    try {
      const data = await apiGet("/watchlist/intelligence", {}, { authToken: auth.token });
      return proResult(data, deps.citationUrl);
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};
