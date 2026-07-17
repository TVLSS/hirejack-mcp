import { z } from "zod";
import { apiGet, siteUrl } from "../lib/api.js";
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
