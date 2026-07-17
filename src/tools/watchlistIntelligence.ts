import { z } from "zod";
import { apiGet, siteUrl } from "../lib/api.js";
import { envelopeSchema } from "../lib/format.js";
import { monthlyCountSchema, skillShareSchema } from "../lib/outputShapes.js";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import type { Tool } from "../registry.js";

const inputSchema = z.object({});

export const watchlistIntelligenceTool: Tool = {
  name: "watchlist_intelligence",
  description:
    "Aggregate hiring intelligence on every company the authenticated user " +
    "is watching. " + "Pro tier." + " For each watched company returns: " +
    "totalJobs currently open, hiringTrend (up/down/stable), trendPct " +
    "(week-over-week %), topSkills the company is hiring for, medianSalary, " +
    "sparkline data (last ~12 weeks of job counts), and jobDelta since the " +
    "previous snapshot. Use for queries like 'what's happening at the " +
    "companies I'm watching?' or 'which of my watched companies are scaling " +
    "up right now?'. Not for a plain list of watched companies — use " +
    "`list_watchlist` for that.",
  inputSchema,
  outputSchema: envelopeSchema(
    z
      .object({
        companies: z
          .array(
            z
              .object({
                domain: z.string().optional().describe("Pass to get_company_profile / company_fit / watch_company"),
                companyName: z.string().optional(),
                followedAt: z.string().optional().describe("ISO timestamp the user followed the company"),
                available: z.boolean().optional().describe("False when no company profile exists — only domain/companyName/followedAt are present"),
                totalJobs: z.number().optional(),
                engineeringJobs: z.number().optional(),
                engineeringPct: z.number().optional().describe("Engineering share of open roles, 0-100"),
                medianSalary: z.number().nullable().optional().describe("Annual USD, null when too few postings disclose pay"),
                hiringTrend: z.string().optional().describe("'up' | 'down' | 'stable'"),
                trendPct: z.number().optional().describe("Trend magnitude, % change"),
                jobDelta: z.number().nullable().optional().describe("Job-count change vs the prior month; null with <2 months of history"),
                jobDeltaPct: z.number().nullable().optional().describe("jobDelta as %, null when prior month was 0"),
                topSkills: z.array(skillShareSchema).optional().describe("Capped at 8"),
                sparkline: z.array(monthlyCountSchema).optional().describe("Last ~6 months of job counts"),
                topLocations: z.array(z.object({}).passthrough()).optional().describe("Capped at 3"),
                industry: z.string().nullable().optional(),
              })
              .passthrough(),
          )
          .optional()
          .describe("One entry per watched company, trending-up companies first"),
        message: z.string().optional().describe("Present when the watchlist is empty"),
      })
      .passthrough(),
    "Hiring intelligence for every company on the user's watchlist",
  ),
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
