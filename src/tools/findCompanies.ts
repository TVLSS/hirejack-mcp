import { z } from "zod";
import { apiGet, siteUrl } from "../lib/api.js";
import { envelopeSchema } from "../lib/format.js";
import { skillShareSchema } from "../lib/outputShapes.js";
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

const inputSchema = z.object({
  industry: z
    .string()
    .optional()
    .describe("Industry substring filter (case-insensitive). E.g. 'fintech', 'health', 'AI', 'defense'."),
  family: z
    .enum(FAMILIES)
    .optional()
    .describe(
      "Only companies hiring for this role family (e.g. " +
        "'machine_learning'). Omit to include all families. ANDs with the " +
        "other filters.",
    ),
  skill: z
    .string()
    .optional()
    .describe(
      "Only companies whose top skills include this (case-insensitive " +
        "substring, e.g. 'Rust'). Omit to skip skill filtering.",
    ),
  trend: z
    .enum(["up", "down", "stable"])
    .optional()
    .describe(
      "Hiring trend filter, from each company's 2-month rolling job-count " +
        "average: 'up' = growing, 'down' = shrinking, 'stable' = flat.",
    ),
  minJobs: z.coerce.number().int().min(0).optional().describe("Minimum total open jobs (default 0)"),
  maxJobs: z.coerce.number().int().min(0).optional().describe("Maximum total open jobs (default unlimited)"),
  limit: z.coerce.number().int().min(1).max(100).optional().describe("Max companies to return (1-100, default 25)"),
});

export const findCompaniesTool: Tool = {
  name: "find_companies",
  description:
    "Multi-axis company segmentation. " + "Analyst tier." + " Filter by industry, role " +
    "family they're hiring for, top-skill match, hiring trend, job-count " +
    "range. Returns companies sorted by total open jobs descending. Use for " +
    "'fintech companies hiring ML engineers', 'defense tech companies " +
    "scaling up', or 'who's hiring 100+ engineers and growing?'. Not for a " +
    "simple name or industry lookup — use `search_companies` for that.",
  inputSchema,
  outputSchema: envelopeSchema(
    z
      .object({
        matched: z.number().optional().describe("Companies matching the filters (before the limit)"),
        returned: z.number().optional().describe("Companies in this response"),
        companies: z
          .array(
            z
              .object({
                domain: z.string().optional().describe("Pass to get_company_profile / get_company_history / company_fit"),
                companyName: z.string().optional(),
                industry: z.string().optional(),
                totalJobs: z.number().optional(),
                engineeringJobs: z.number().optional(),
                hiringTrend: z.string().optional().describe("'up' | 'down' | 'stable'"),
                trendPct: z.number().optional().describe("Trend magnitude, % change"),
                medianSalary: z.number().nullable().optional().describe("Annual USD, when enough postings disclose pay"),
                topSkills: z.array(skillShareSchema).optional().describe("Capped at 5"),
              })
              .passthrough(),
          )
          .optional()
          .describe("Matching companies, most open jobs first"),
        filters: z.object({}).passthrough().optional().describe("Echo of the applied filters"),
      })
      .passthrough(),
    "Companies matching the segmentation filters",
  ),
  handler: async (args, ctx) => {
    const deps = {
      ctx,
      citationUrl: siteUrl("/companies.html"),
      toolLabel: "find_companies",
      analyst: true,
    };
    const auth = requireUser(deps);
    if ("error" in auth) return auth.error;
    try {
      const data = await apiGet("/analyst/find-companies", args, { authToken: auth.token });
      return proResult(data, deps.citationUrl);
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};
