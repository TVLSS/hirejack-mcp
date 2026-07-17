import { z } from "zod";
import { apiGet, siteUrl } from "../lib/api.js";
import { envelopeSchema } from "../lib/format.js";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import type { Tool } from "../registry.js";

const inputSchema = z.object({});

const missingSkillSchema = z
  .object({
    id: z.string().optional().describe("Skill id from codex/skills.json"),
    name: z.string().optional(),
    rolesNeeding: z.number().optional().describe("How many of the user's desired roles require it (impact rank)"),
    roles: z.array(z.string()).optional().describe("The desired-role titles that require it"),
    learn: z
      .object({
        primary: z.object({}).passthrough().nullable().optional().describe("Recommended course link (provider, url, title, free, ...)"),
        alternates: z.array(z.object({}).passthrough()).optional(),
      })
      .passthrough()
      .nullable()
      .optional()
      .describe("Learning resources for the skill, when known"),
  })
  .passthrough();

export const skillGapTool: Tool = {
  name: "skill_gap",
  description:
    "Analyze the gap between the authenticated user's current skills and " +
    "what their desired roles require in the live market. " + "Pro tier." + " Returns " +
    "matchPct (0-100), the list of skills the user already has that map to " +
    "their target roles, and the list of missing skills ranked by impact " +
    "(how often the skill appears in target-role postings). Use for 'what " +
    "should I learn next?' or 'how close am I to senior PM roles?'. Not for " +
    "simulating the payoff of skills the user might LEARN — use " +
    "`skill_impact` for that.",
  inputSchema,
  outputSchema: envelopeSchema(
    z
      .object({
        matchPct: z.number().optional().describe("Share of target-role skills the user already has, 0-100"),
        matchedSkills: z
          .array(z.object({ id: z.string().optional(), name: z.string().optional() }).passthrough())
          .optional()
          .describe("User skills that map to their desired roles"),
        missingSkills: z.array(missingSkillSchema).optional().describe("Skills the desired roles require that the user lacks, most impactful first"),
        topGaps: z.array(missingSkillSchema).optional().describe("Top 5 of missingSkills"),
        learnDisclosure: z.string().nullable().optional().describe("Affiliate-link disclosure text when learn links are present"),
        message: z.string().optional().describe("Present (with matchPct 0) when the profile lacks skills or desired roles"),
      })
      .passthrough(),
    "Gap between the user's skills and their desired roles' requirements",
  ),
  handler: async (_args, ctx) => {
    const deps = {
      ctx,
      citationUrl: siteUrl("/intelligence.html"),
      toolLabel: "skill_gap",
    };
    const auth = requireUser(deps);
    if ("error" in auth) return auth.error;
    try {
      const data = await apiGet("/skill-gap", {}, { authToken: auth.token });
      return proResult(data, deps.citationUrl);
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};
