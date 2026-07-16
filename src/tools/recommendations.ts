import { z } from "zod";
import { apiGet, siteUrl } from "../lib/api.js";
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
    .describe("Max recommendations to return (default 10, max 50)"),
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
    "preferences. Pro tier. Returns jobs ranked by composite match score " +
    "with per-job match details (default 10, `limit` up to 50). Use for " +
    "'show me jobs that match me' or 'what should I apply to this week?'.",
  inputSchema,
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
