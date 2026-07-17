import { z } from "zod";
import { apiGet, siteUrl, ApiError } from "../lib/api.js";
import { toolResult, toolError } from "../lib/format.js";
import type { Tool } from "../registry.js";

// Non-strict like every other tool: unknown keys are ignored rather than
// erroring (clients occasionally send junk args to no-parameter tools).
const inputSchema = z.object({});
type Args = z.infer<typeof inputSchema>;

type Stats = Record<string, unknown> & {
  totalJobs?: number;
  totalCompanies?: number;
  remotePct?: number;
};

export const getMarketPulseTool: Tool = {
  name: "get_market_pulse",
  description:
    "Get HireJack's market-wide snapshot: total open tech jobs, tracked " +
    "companies, remote share, top skills by demand, top companies by " +
    "hiring volume, and trending skills (week-over-week movers). Use for " +
    "high-level market questions like 'how is the tech job market right " +
    "now?' or 'what skills are trending?'. Not for history or time-series " +
    "(`get_market_history`, Analyst) or job-level search (`search_jobs`).",
  inputSchema,
  handler: async (_args: Args) => {
    try {
      const stats = await apiGet<Stats>("/stats");
      return toolResult({
        data: stats,
        citation_url: siteUrl("/market/"),
      });
    } catch (err) {
      if (err instanceof ApiError) {
        return toolError(`HireJack API error (${err.status}): ${err.message}`);
      }
      return toolError(
        `Unexpected error: ${(err as Error).message ?? String(err)}`,
      );
    }
  },
};
