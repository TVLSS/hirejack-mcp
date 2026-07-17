import { z } from "zod";
import { apiGet, siteUrl } from "../lib/api.js";
import { envelopeSchema } from "../lib/format.js";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import type { Tool } from "../registry.js";

const FAMILIES = [
  "software_engineering",
  "data_engineering",
  "machine_learning",
  "security",
  "product",
  "design",
  "operations",
  "marketing",
  "sales",
  "finance",
  "people",
  "services",
  "legal",
  "other",
] as const;

const SENIORITIES = [
  "intern",
  "junior",
  "mid",
  "senior",
  "staff",
  "principal",
  "manager",
  "director",
  "vp",
] as const;

const inputSchema = z.object({
  family: z
    .enum(FAMILIES)
    .optional()
    .describe("Role family to benchmark against. Omit to benchmark against the whole market."),
  seniority: z
    .enum(SENIORITIES)
    .optional()
    .describe("Seniority level to benchmark against. Omit to include all seniority levels in the slice."),
  salary: z.coerce
    .number()
    .int()
    .optional()
    .describe(
      "User's current annual USD salary. When provided, the response includes " +
        "the user's percentile ranking within the slice.",
    ),
});

const percentilesSchema = z
  .object({
    p10: z.number().optional().describe("10th percentile, annual USD"),
    p25: z.number().optional().describe("25th percentile, annual USD"),
    median: z.number().optional().describe("50th percentile, annual USD"),
    p75: z.number().optional().describe("75th percentile, annual USD"),
    p90: z.number().optional().describe("90th percentile, annual USD"),
    count: z.number().optional().describe("Disclosed salary ranges in the slice"),
  })
  .passthrough();

export const salaryBenchmarkTool: Tool = {
  name: "salary_benchmark",
  description:
    "Compare a salary against the live HireJack market for a role family + " +
    "seniority slice. " + "Pro tier." + " Returns precomputed P10/P25/P50/P75/P90 " +
    "percentiles, the user's percentile ranking (when `salary` is supplied), " +
    "and a career-ladder progression of medians by seniority. Use for 'am I " +
    "paid well as a senior backend engineer?' or 'what should I ask for?'. " +
    "Not for a specific job's posted range (`get_job`) or market-wide comp " +
    "stats (`get_market_pulse`).",
  inputSchema,
  outputSchema: envelopeSchema(
    z
      .object({
        query: z
          .object({
            family: z.string().nullable().optional(),
            seniority: z.string().nullable().optional(),
            salary: z.number().nullable().optional(),
          })
          .passthrough()
          .optional()
          .describe("Echo of the requested slice"),
        benchmark: percentilesSchema.optional().describe("Percentiles for the requested slice"),
        label: z.string().optional().describe("Human-readable slice name, e.g. 'software engineering (senior)'"),
        percentile: z.number().nullable().optional().describe("User's percentile (0-99) within the slice; null when no salary was supplied"),
        comparison: z
          .object({
            vsMedian: z.number().optional().describe("User salary minus slice median, annual USD"),
            vsMedianPct: z.number().optional().describe("Difference vs median, %"),
            description: z.string().optional(),
          })
          .passthrough()
          .nullable()
          .optional(),
        progression: z
          .array(
            z
              .object({
                level: z.string().optional().describe("intern|junior|mid|senior|staff|principal|manager|director|vp"),
                median: z.number().optional().describe("Annual USD"),
                p25: z.number().optional(),
                p75: z.number().optional(),
                count: z.number().optional(),
              })
              .passthrough(),
          )
          .nullable()
          .optional()
          .describe("Career-ladder medians by seniority for the family; null when no family was given"),
        global: percentilesSchema.optional().describe("Whole-market percentiles for context"),
        error: z.string().optional().describe("Present (with only `global`) when the slice has too little data"),
      })
      .passthrough(),
    "Salary percentile benchmark for a role family + seniority slice",
  ),
  handler: async (args, ctx) => {
    const deps = {
      ctx,
      citationUrl: siteUrl(args.family ? `/salaries/${args.family}/` : "/salaries.html"),
      toolLabel: "salary_benchmark",
    };
    const auth = requireUser(deps);
    if ("error" in auth) return auth.error;
    try {
      const data = await apiGet("/salary/benchmark", args, { authToken: auth.token });
      return proResult(data, deps.citationUrl);
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};
