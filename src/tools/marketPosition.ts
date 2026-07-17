import { z } from "zod";
import { apiGet, siteUrl } from "../lib/api.js";
import { envelopeSchema } from "../lib/format.js";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import type { Tool } from "../registry.js";

const inputSchema = z.object({});

export const marketPositionTool: Tool = {
  name: "market_position",
  description:
    "Compute the authenticated user's market position score (0-100). " + "Pro tier." + " " +
    "Weighted: 50% skill demand against current market, 20% seniority fit, " +
    "15% remote availability for the user's preference, 15% skill breadth. " +
    "Returns score, matchingJobs count, salaryMedian for matching roles, " +
    "per-skill demand breakdown, and the top companies whose tech stacks " +
    "align best with the user's skills. Use for queries like 'how do I " +
    "stack up against the market?' or 'what's my market position right " +
    "now?'. Not for job-specific (`match_job`) or company-specific " +
    "(`company_fit`) scores.",
  inputSchema,
  outputSchema: envelopeSchema(
    z
      .object({
        score: z.number().optional().describe("Market position score, 0-100 (skill demand 50%, seniority fit 20%, remote availability 15%, skill breadth 15%)"),
        matchingJobs: z.number().optional().describe("Conservative estimate of jobs matching the user's top skills"),
        salaryMedian: z.number().optional().describe("Market median salary, annual USD"),
        remoteAvailPct: z.number().optional().describe("Share of jobs that are remote or hybrid, 0-100"),
        seniorityJobPct: z.number().optional().describe("Share of jobs at the user's seniority level, 0-100"),
        skillDemand: z
          .array(
            z
              .object({
                skill: z.string().optional(),
                companies: z.number().optional().describe("Companies mentioning the skill"),
                companyPct: z.number().optional().describe("Share of tracked companies mentioning it, 0-100"),
                totalMentions: z.number().optional().describe("Job postings mentioning it"),
                rank: z.number().nullable().optional().describe("Rank among top market skills; null when not ranked"),
                demand: z.string().optional().describe("'high' | 'medium' | 'low' | 'niche'"),
              })
              .passthrough(),
          )
          .optional()
          .describe("Per-skill market demand for each of the user's skills, highest demand first"),
        topMatchingCompanies: z
          .array(
            z
              .object({
                name: z.string().optional(),
                domain: z.string().optional().describe("Pass to get_company_profile / company_fit"),
                totalJobs: z.number().optional(),
                matchingSkills: z.number().optional().describe("How many of the user's skills appear in the company's top skills"),
                skills: z.array(z.string()).optional().describe("The overlapping skill names (capped at 5)"),
              })
              .passthrough(),
          )
          .optional()
          .describe("Companies whose tech stacks best overlap the user's skills (capped at 10)"),
        totals: z
          .object({
            trackedJobs: z.number().optional(),
            trackedCompanies: z.number().optional(),
            userSkillCount: z.number().optional(),
          })
          .passthrough()
          .optional(),
        message: z.string().optional().describe("Present (with score 0) when the profile has no skills or market data is unavailable"),
      })
      .passthrough(),
    "The authenticated user's overall market position",
  ),
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
