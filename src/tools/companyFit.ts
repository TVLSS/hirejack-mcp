import { z } from "zod";
import { apiGet, siteUrl } from "../lib/api.js";
import { envelopeSchema } from "../lib/format.js";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import type { Tool } from "../registry.js";

const inputSchema = z.object({
  domain: z.string().min(1).describe("Company domain (e.g. 'anthropic.com')"),
});

const stackSkillSchema = z
  .object({
    name: z.string().optional(),
    companyJobs: z.number().optional().describe("Company postings mentioning the skill"),
    companyPct: z.number().optional().describe("Share of the company's postings mentioning it, 0-100"),
  })
  .passthrough();

export const companyFitTool: Tool = {
  name: "company_fit",
  description:
    "Score how well the authenticated user fits a company. " + "Pro tier." + " " +
    "Returns fitScore (0-100), 5-dimension breakdown (tech stack 40%, roles " +
    "25%, seniority 15%, location 10%, hiring trend 10%), matching skills, " +
    "skill gaps, role alignment, and a hiring-momentum signal. Use for 'is " +
    "Anthropic a good fit for me?' or 'compare these companies for me'. " +
    "Not for scoring a specific job posting — use `match_job` for that.",
  inputSchema,
  outputSchema: envelopeSchema(
    z
      .object({
        fitScore: z.number().optional().describe("Overall weighted fit, 0-100"),
        companyName: z.string().optional(),
        totalJobs: z.number().optional(),
        industry: z.string().nullable().optional(),
        techStackMatch: z.array(stackSkillSchema).optional().describe("Company top skills the user has"),
        techStackGaps: z.array(stackSkillSchema).optional().describe("Company top skills the user lacks (capped at 10)"),
        techMatchPct: z.number().optional().describe("Share of the company's top skills the user has, 0-100"),
        roleAlignment: z
          .array(
            z
              .object({
                family: z.string().optional().describe("Role family the company hires for"),
                jobs: z.number().optional(),
                pct: z.number().optional().describe("Share of company postings in this family, 0-100"),
                match: z.boolean().optional().describe("True when the family covers one of the user's desired roles"),
              })
              .passthrough(),
          )
          .optional()
          .describe("Capped at 8"),
        roleAlignPct: z.number().optional().describe("Summed pct of matching families, 0-100"),
        seniorityFit: z
          .object({
            level: z.string().optional(),
            jobs: z.number().optional(),
            pct: z.number().optional().describe("Share of company postings at the user's level, 0-100"),
          })
          .passthrough()
          .nullable()
          .optional()
          .describe("Null when the company has no postings at the user's seniority level"),
        locationMatch: z.boolean().optional(),
        remoteFit: z.boolean().optional().describe("True when the company has remote postings"),
        trendSignal: z.string().optional().describe("'scaling' | 'growing' | 'stable' | 'contracting'"),
        trendPct: z.number().optional().describe("Hiring trend, % change"),
        compensation: z
          .object({
            median: z.number().optional().describe("Company median disclosed salary (annual USD)"),
            distribution: z.unknown().optional(),
          })
          .passthrough()
          .optional(),
        breakdown: z
          .object({
            techStack: z.number().optional(),
            roleAlign: z.number().optional(),
            seniority: z.number().optional(),
            location: z.number().optional(),
            trend: z.number().optional(),
          })
          .passthrough()
          .optional()
          .describe("Per-dimension scores, each 0-100 (weights: tech 40%, roles 25%, seniority 15%, location 10%, trend 10%)"),
        message: z.string().optional().describe("Present (with fitScore 0) when the user's profile has no skills yet"),
      })
      .passthrough(),
    "Company fit score for the authenticated user",
  ),
  handler: async (args, ctx) => {
    const deps = {
      ctx,
      citationUrl: siteUrl(`/companies/${args.domain}/`),
      toolLabel: "company_fit",
    };
    const auth = requireUser(deps);
    if ("error" in auth) return auth.error;
    try {
      const data = await apiGet("/company-fit", args, { authToken: auth.token });
      return proResult(data, deps.citationUrl);
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};
