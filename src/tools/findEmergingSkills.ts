import { z } from "zod";
import { apiGet, siteUrl } from "../lib/api.js";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import type { Tool } from "../registry.js";

const inputSchema = z.object({
  adoptionMin: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "Minimum companies that must currently mention the skill (default 3). " +
        "Lower = catches earlier-stage skills.",
    ),
  adoptionMax: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "Maximum companies — excludes already-mainstream skills (default 30). " +
        "The point is to find what's *emerging*, not what's already everywhere.",
    ),
  growthMin: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Minimum month-over-month growth percentage (default 25)"),
  limit: z.number().int().min(1).max(50).optional().describe("Max skills to return (default 20)"),
});

export const findEmergingSkillsTool: Tool = {
  name: "find_emerging_skills",
  description:
    "Skills with low-but-growing market adoption — early-stage signals. " +
    "Pro+ tier. Computes month-over-month growth in companyCount across " +
    "the most recent two monthly snapshots, filters to skills with low " +
    "current adoption (the 'emerging' criterion). Use for 'what skills are " +
    "quietly trending?' or 'what should I learn before everyone else?'.",
  inputSchema,
  handler: async (args, ctx) => {
    const deps = {
      ctx,
      citationUrl: siteUrl("/skills/trending/"),
      toolLabel: "find_emerging_skills",
    };
    const auth = requireUser(deps);
    if ("error" in auth) return auth.error;
    try {
      const data = await apiGet("/analyst/find-emerging-skills", args, { authToken: auth.token });
      return proResult(data, deps.citationUrl);
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};
