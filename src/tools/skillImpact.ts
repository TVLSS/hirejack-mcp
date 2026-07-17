import { z } from "zod";
import { apiGet, siteUrl } from "../lib/api.js";
import { envelopeSchema } from "../lib/format.js";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import type { Tool } from "../registry.js";

const inputSchema = z.object({});

export const skillImpactTool: Tool = {
  name: "skill_impact",
  description:
    "For each skill the authenticated user does NOT have, simulate adding it " +
    "and compute the market impact. " + "Pro tier." + " Returns a ranked list of " +
    "skills with: newJobsUnlocked (jobs that previously didn't match but " +
    "would after learning the skill), boostedJobs (existing matches that " +
    "would score higher), companiesNeedingIt, relevantRoles, and a composite " +
    "impactScore. Also returns profileCompleteness so the caller can suggest " +
    "filling missing profile fields. Use for queries like 'what should I " +
    "learn next?' or 'which skill would unlock the most jobs for me?'. Not " +
    "for auditing the user's CURRENT skills against their target roles — " +
    "use `skill_gap` for that.",
  inputSchema,
  outputSchema: envelopeSchema(
    z
      .object({
        skillImpacts: z
          .array(
            z
              .object({
                skillId: z.string().optional(),
                skillName: z.string().optional(),
                jobsMentioning: z.number().optional().describe("Sampled jobs mentioning the skill"),
                companiesNeedingIt: z.number().optional(),
                newJobsUnlocked: z.number().optional().describe("Jobs that would newly match after learning it"),
                boostedJobs: z.number().optional().describe("Existing matches whose score would rise"),
                avgBoostPoints: z.number().optional(),
                topCompanies: z.array(z.string()).optional().describe("Company domains needing the skill (capped at 5)"),
                relevantRoles: z.array(z.string()).optional().describe("Desired-role titles that list it as required"),
                learn: z
                  .object({
                    primary: z.object({}).passthrough().nullable().optional().describe("Recommended course link (provider, url, title, free, ...)"),
                    alternates: z.array(z.object({}).passthrough()).optional(),
                  })
                  .passthrough()
                  .nullable()
                  .optional(),
                impactScore: z.number().optional().describe("Composite ranking score (unlocked x3 + boosted + companies x2 + roles x5)"),
              })
              .passthrough(),
          )
          .optional()
          .describe("Highest-impact skills to learn, ranked (capped at 10)"),
        totalJobsAnalyzed: z.number().optional().describe("Size of the job sample simulated against"),
        currentMatchingJobs: z.number().optional().describe("Jobs matching the user's current skills in the sample"),
        profileCompleteness: z
          .object({
            hasSkills: z.boolean().optional(),
            hasRoles: z.boolean().optional(),
            hasLocation: z.boolean().optional(),
            hasSeniority: z.boolean().optional(),
            hasResume: z.boolean().optional(),
            hasName: z.boolean().optional(),
            score: z.number().optional().describe("Profile completeness, 0-100"),
          })
          .passthrough()
          .optional(),
        learnDisclosure: z.string().nullable().optional().describe("Affiliate-link disclosure text when learn links are present"),
        message: z.string().optional().describe("Present when the profile has no skills yet"),
      })
      .passthrough(),
    "Simulated market impact of skills the user could learn",
  ),
  handler: async (_args, ctx) => {
    const deps = {
      ctx,
      citationUrl: siteUrl("/intelligence.html"),
      toolLabel: "skill_impact",
    };
    const auth = requireUser(deps);
    if ("error" in auth) return auth.error;
    try {
      const data = await apiGet("/skill-impact", {}, { authToken: auth.token });
      return proResult(data, deps.citationUrl);
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};
