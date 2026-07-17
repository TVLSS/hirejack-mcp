import { z } from "zod";
import { apiGet, siteUrl } from "../lib/api.js";
import { envelopeSchema } from "../lib/format.js";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import type { Tool } from "../registry.js";

const inputSchema = z.object({
  range: z
    .enum(["daily", "monthly"])
    .optional()
    .describe(
      "Granularity. 'daily' returns up to 90 days back (rich, recent). " +
        "'monthly' returns up to 24 months back (coarser, longer view). " +
        "Defaults to daily.",
    ),
  days: z.coerce
    .number()
    .int()
    .min(1)
    .max(90)
    .optional()
    .describe(
      "Days of daily history (1-90, default 30). Only used when " +
        "range='daily'; ignored for range='monthly'.",
    ),
  months: z.coerce
    .number()
    .int()
    .min(1)
    .max(24)
    .optional()
    .describe(
      "Months of monthly history (1-24, default 12). Only used when " +
        "range='monthly'; ignored for range='daily'.",
    ),
  detail: z
    .enum(["compact", "full"])
    .optional()
    .describe(
      "'compact' (default) returns a slim per-snapshot series (date, jobs, " +
        "companies, remote share, median comp) plus full distributions for " +
        "only the first and latest snapshots — enough for trend analysis at " +
        "~10x less output. 'full' returns every snapshot's complete " +
        "distributions (seniority, family, top skills); only use when you " +
        "need per-date distribution detail.",
    ),
});

const fullSnapshotSchema = z
  .object({
    date: z.string().optional().describe("YYYY-MM-DD (daily granularity)"),
    month: z.string().optional().describe("YYYY-MM (monthly granularity)"),
    totals: z.object({}).passthrough().optional().describe("Market totals (jobs, companies, engineeringPct, ...)"),
    remoteDistribution: z.object({}).passthrough().optional().describe("Job counts by work mode (remote/hybrid/onsite)"),
    compensationStats: z.object({}).passthrough().optional().describe("Salary stats incl. marketMedian (annual USD)"),
    seniorityDistribution: z.array(z.object({}).passthrough()).optional(),
    familyDistribution: z.array(z.object({}).passthrough()).optional(),
    topSkills: z.array(z.object({}).passthrough()).optional().describe("Top 10 skills by prevalence"),
  })
  .passthrough();

const compactSnapshotSchema = z
  .object({
    date: z.string().optional().describe("YYYY-MM-DD (daily granularity)"),
    month: z.string().optional().describe("YYYY-MM (monthly granularity)"),
    jobs: z.number().optional().describe("Total tracked jobs"),
    companies: z.number().optional().describe("Total tracked companies"),
    engineeringPct: z.number().optional().describe("Engineering share of jobs, 0-100"),
    remotePct: z.number().nullable().optional().describe("Remote share of jobs, 0-100; null when work-mode data is missing"),
    medianComp: z.number().optional().describe("Market median salary, annual USD"),
  })
  .passthrough();

export const getMarketHistoryTool: Tool = {
  name: "get_market_history",
  description:
    "Time-series of market-wide hiring stats: total jobs, remote share, " +
    "compensation, seniority + family distribution, top skills. " + "Analyst tier." + " " +
    "Daily resolution back to early March 2026; monthly resolution from " +
    "March 2026. Use for 'how has the market shifted in 2026?' or 'is " +
    "remote hiring trending up?'. Not for the current snapshot — use " +
    "`get_market_pulse` for that.",
  inputSchema,
  outputSchema: envelopeSchema(
    z
      .object({
        granularity: z.string().optional().describe("'daily' | 'monthly'"),
        days: z.number().optional().describe("Window size (daily granularity)"),
        months: z.number().optional().describe("Window size (monthly granularity)"),
        detail: z.string().optional().describe("'compact' — present only in compact mode"),
        series: z.array(compactSnapshotSchema).optional().describe("Compact mode: slim per-snapshot series, oldest first"),
        endpoints: z
          .object({
            first: fullSnapshotSchema.optional(),
            latest: fullSnapshotSchema.optional(),
          })
          .passthrough()
          .optional()
          .describe("Compact mode: full distributions for the first and latest snapshots only"),
        snapshots: z.array(fullSnapshotSchema).optional().describe("Full mode (detail='full'): every snapshot's complete distributions, oldest first"),
      })
      .passthrough(),
    "Market-wide hiring time-series; shape depends on `detail` (compact: series+endpoints, full: snapshots)",
  ),
  handler: async (args, ctx) => {
    const deps = {
      ctx,
      citationUrl: siteUrl("/market/"),
      toolLabel: "get_market_history",
    };
    const auth = requireUser(deps);
    if ("error" in auth) return auth.error;
    try {
      const data = await apiGet("/analyst/history/market", args, { authToken: auth.token });
      return proResult(data, deps.citationUrl);
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};
