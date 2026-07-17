import { z } from "zod";
import { apiGet, siteUrl } from "../lib/api.js";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import type { Tool } from "../registry.js";

const inputSchema = z.object({
  adoptionMin: z.coerce
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "Minimum companies that must currently mention the skill (default 5). " +
        "Lower = catches earlier-stage skills.",
    ),
  adoptionMax: z.coerce
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "Maximum companies — excludes already-mainstream skills (default 25). " +
        "The point is to find what's *emerging*, not what's already everywhere.",
    ),
  growthMin: z.coerce
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Minimum growth percentage across the snapshot window (default 30)"),
  minDelta: z.coerce
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      "Minimum ABSOLUTE company-count gain over the window (default 4). Filters " +
        "small-base noise — a skill going 2→4 is +100% but only +2 companies.",
    ),
  baseMax: z.coerce
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "Maximum companies at the START of the window (default 8). Enforces the " +
        "'started obscure' criterion so already-established skills don't qualify.",
    ),
  limit: z.coerce.number().int().min(1).max(50).optional().describe("Max skills to return (1-50, default 20)"),
});

export const findEmergingSkillsTool: Tool = {
  name: "find_emerging_skills",
  description:
    "Skills with low-but-consistently-growing market adoption — early-stage signals. " +
    "" + "Analyst tier." + " Tracks companyCount across the last 3 monthly snapshots and " +
    "surfaces skills that climbed consistently (non-decreasing) from a low base, " +
    "with a meaningful absolute company-count gain — not just a big percentage on a " +
    "tiny base. Use for 'what skills are quietly trending?' or 'what should I learn " +
    "before everyone else?'. Defaults: adoptionMin 5, adoptionMax 25, growthMin 30%, " +
    "minDelta 4, baseMax 8, limit 20. Returns a deliberately tight list; loosen " +
    "minDelta / baseMax / growthMin to widen it. Not for trend lines on an " +
    "established, named skill (`get_skill_history`) or role-level emergence " +
    "(`find_emerging_roles`).",
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
