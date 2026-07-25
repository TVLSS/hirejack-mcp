import { z } from "zod";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import { envelopeSchema, toolError } from "../lib/format.js";
import { apiGetJobVariants, jobCitationUrl, resolveJobRef } from "../lib/jobRef.js";
import type { Tool } from "../registry.js";

const inputSchema = z
  .object({
    domain: z
      .string()
      .optional()
      .describe("Company domain (e.g. 'stripe.com'). Required unless `url` is provided."),
    jobId: z
      .string()
      .optional()
      .describe(
        "Pass the `id` field from a `search_jobs` result VERBATIM — do not " +
          "reformat, do not replace `#` with `-`. The id is the literal value " +
          "search_jobs returned (e.g. 'greenhouse#stripe#4921361'). Always " +
          "fetch a real id via search_jobs first since postings rotate. " +
          "Required unless `url` is provided.",
      ),
    url: z
      .string()
      .optional()
      .describe(
        "Full HireJack job detail URL (e.g. 'https://hirejack.com/jobs/stripe.com/sw-eng-12345/'). " +
          "Convenience alternative to passing `domain` + `jobId` separately.",
      ),
  })
  .refine((v) => v.url || (v.domain && v.jobId), {
    message: "Provide either `url` OR both `domain` and `jobId`.",
  });

const matchSkillSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    primary: z.boolean().optional().describe("True when the skill is a must-have for the job's role (weighted 2x in the skill match %)"),
  })
  .passthrough();

export const matchJobTool: Tool = {
  name: "match_job",
  description:
    "Score how well the authenticated user matches a specific job. " + "Pro tier." + " " +
    "Returns matchPct (0-100, the same score the website shows for this " +
    "job), requirementsPct (how much of this posting's own requirement " +
    "list the user meets), a dimension breakdown (skills, role, " +
    "seniority, location, remote — plus experience when both the user's " +
    "resume-derived years and the job's required years are known, and " +
    "semantic when both the user's profile and the job carry embeddings), " +
    "matched/missing/bonus skill lists, an experienceFit comparison, " +
    "ATS-specific resume tips for the company's ATS, and a priorityScore " +
    "that factors hiring velocity. Use for queries like 'how well do I " +
    "match this job?' or 'should I apply?'. Not for company-level fit " +
    "(`company_fit`) or discovering new jobs (`recommendations`).",
  inputSchema,
  outputSchema: envelopeSchema(
    z
      .object({
        matchPct: z.number().optional().describe("The canonical match score, 0-100 — the SAME number HireJack shows on the job page, in the For You list and in its match emails, so quote this one. Profile-vs-job fit: matched skills, desired role, family, location, remote preference, seniority, experience and embedding similarity, over the best score that profile could achieve"),
        requirementsPct: z.number().optional().describe("A different question: what % of THIS posting's listed requirements the user meets, weighting the role's must-have skills 2x. High when the user covers a short requirements list; not comparable across jobs. `breakdown` audits this number, not matchPct"),
        skillMatchPct: z.number().optional().describe("Skills dimension alone, 0-100"),
        matchedSkills: z.array(matchSkillSchema).optional(),
        missingSkills: z.array(matchSkillSchema).optional(),
        bonusSkills: z.array(matchSkillSchema).optional().describe("Skills the user has that the role values but the posting didn't list"),
        seniorityMatch: z.boolean().optional(),
        locationMatch: z.boolean().optional(),
        remoteMatch: z.boolean().optional(),
        roleMatch: z.boolean().optional().describe("True on a desired-role match OR a same-family match"),
        priorityScore: z.number().optional().describe("0-100; 70% of matchPct (the canonical score) + 30% of the company's hiring velocity"),
        atsTips: z.array(z.string()).optional().describe("Actionable resume tips, including ATS-platform-specific ones"),
        atsType: z.string().optional().describe("Detected ATS platform (e.g. 'greenhouse', 'workday') or 'unknown'"),
        salaryContext: z
          .object({
            jobMidpoint: z.number().optional().describe("Midpoint of the job's disclosed range (annual USD)"),
            marketMedian: z.number().optional().describe("Market-wide median salary (annual USD)"),
            diffPct: z.number().optional().describe("Job midpoint vs market median, %"),
            label: z.string().optional(),
          })
          .passthrough()
          .nullable()
          .optional()
          .describe("Null when the job lists no salary range"),
        experienceFit: z
          .object({
            userYears: z.number().optional(),
            jobYearsMin: z.number().optional(),
            qualified: z.boolean().optional(),
          })
          .passthrough()
          .optional()
          .describe("Present only when both the user's resume-derived years and the job's required years are known"),
        semanticFit: z
          .object({
            cosine: z.number().optional().describe("Raw cosine similarity between profile and job embeddings"),
            credit: z.number().optional().describe("Cosine mapped through the 0.25 noise floor / 0.75 saturation curve, 0-100"),
          })
          .passthrough()
          .optional()
          .describe("Present only when both the user's profileEmb and the job's emb exist"),
        breakdown: z
          .object({
            skills: z.number().optional(),
            role: z.number().optional(),
            seniority: z.number().optional(),
            location: z.number().optional(),
            remote: z.number().optional(),
            experience: z.number().optional().describe("Present only when the experience dimension is scored"),
            semantic: z.number().optional().describe("Embedding similarity between the user's profile and the full job description, 0-100. Present only when both the user's profileEmb and the job's emb exist; weighted 20% when scored"),
          })
          .passthrough()
          .optional()
          .describe("Per-dimension scores, each 0-100"),
        message: z.string().optional().describe("Present (with matchPct 0) when the user's profile has no skills yet"),
      })
      .passthrough(),
    "Job match score for the authenticated user against one posting",
  ),
  handler: async (args, ctx) => {
    const ref = resolveJobRef(args);
    if ("error" in ref) return toolError(ref.error);
    const deps = {
      ctx,
      citationUrl: jobCitationUrl(ref.domain, ref.jobId),
      toolLabel: "match_job",
    };
    const auth = requireUser(deps);
    if ("error" in auth) return auth.error;
    try {
      const data = await apiGetJobVariants("/job-match", ref.domain, ref.jobId, auth.token);
      return proResult(data, deps.citationUrl);
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};
