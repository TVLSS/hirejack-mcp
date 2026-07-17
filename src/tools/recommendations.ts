import { z } from "zod";
import { apiGet, siteUrl } from "../lib/api.js";
import { envelopeSchema } from "../lib/format.js";
import { jobSlimSchema } from "../lib/outputShapes.js";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import { safeId } from "../lib/jobRef.js";
import type { Tool } from "../registry.js";

const inputSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Max recommendations to return (1-50, default 10)"),
});

type RecJob = {
  canonicalId?: string;
  companyDomain?: string;
  companyName?: string;
  titleRaw?: string;
  standardizedTitle?: string;
  family?: string;
  seniority?: string;
  locationRaw?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  postedAt?: string;
  skillNames?: string[];
  url?: string;
  matchDetails?: { skillMatches?: string[]; roleMatch?: boolean; score?: number };
};

type RecResponse = { jobs?: RecJob[]; count?: number; maxScore?: number; message?: string };

export const recommendationsTool: Tool = {
  name: "recommendations",
  description:
    "Get top job recommendations for the authenticated user, scored against " +
    "their profile (skills, desired roles, seniority, location, remote " +
    "preference) and hard-filtered by their remote/US-only/minimum-salary " +
    "preferences. " + "Pro tier." + " Returns jobs ranked by composite match score " +
    "with per-job match details (default 10, `limit` up to 50). Use for " +
    "'show me jobs that match me' or 'what should I apply to this week?'. " +
    "Not for unpersonalized filter searches (`search_jobs`) or scoring one " +
    "known job (`match_job`).",
  inputSchema,
  outputSchema: envelopeSchema(
    z
      .object({
        jobs: z
          .array(
            jobSlimSchema.extend({
              match: z
                .object({
                  skillMatches: z.array(z.string()).optional().describe("User skills the job mentions"),
                  roleMatch: z.boolean().optional().describe("True when the job matches a desired role"),
                  semantic: z.number().optional().describe("Resume-embedding similarity, 0-1"),
                  score: z.number().optional().describe("Composite match score — divide by maxScore for a %"),
                })
                .passthrough()
                .optional(),
            }),
          )
          .optional()
          .describe("Recommended jobs, best match first (slim search_jobs shape + per-job match details)"),
        count: z.number().optional().describe("Jobs returned"),
        maxScore: z.number().optional().describe("Best achievable composite score for this profile — normalizes each job's match.score"),
        message: z.string().optional().describe("Present when the profile is missing skills or desired roles"),
      })
      .passthrough(),
    "Personalized job recommendations for the authenticated user",
  ),
  handler: async (args, ctx) => {
    const deps = {
      ctx,
      citationUrl: siteUrl("/jobs.html?forYou=1"),
      toolLabel: "recommendations",
    };
    const auth = requireUser(deps);
    if ("error" in auth) return auth.error;
    try {
      const limit = args.limit ?? 10;
      const data = await apiGet<RecResponse>("/recommendations", {}, { authToken: auth.token });
      const jobs = (data.jobs || []).slice(0, limit).map(slimRec);
      return proResult(
        { jobs, count: jobs.length, maxScore: data.maxScore, message: data.message },
        deps.citationUrl,
        { limit },
      );
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};

// The upstream Lambda returns full job records (~1.7KB each); trim to the
// same slim shape search_jobs uses so 30 recommendations don't cost 50KB
// of context.
function slimRec(j: RecJob) {
  return {
    id: j.canonicalId,
    title: j.standardizedTitle || j.titleRaw,
    company: j.companyName,
    company_domain: j.companyDomain,
    family: j.family,
    seniority: j.seniority,
    location: j.locationRaw,
    salary:
      j.salaryMin || j.salaryMax
        ? { min: j.salaryMin, max: j.salaryMax, currency: j.salaryCurrency || "USD", period: "year" }
        : null,
    posted_at: j.postedAt,
    skills: (j.skillNames || []).slice(0, 12),
    match: j.matchDetails,
    apply_url: j.url,
    detail_url:
      j.companyDomain && j.canonicalId
        ? siteUrl(`/jobs/${j.companyDomain}/${safeId(j.canonicalId)}/`)
        : undefined,
  };
}
