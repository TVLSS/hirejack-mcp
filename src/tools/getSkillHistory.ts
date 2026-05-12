import { z } from "zod";
import { apiGet, siteUrl } from "../lib/api.js";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import type { Tool } from "../registry.js";

const inputSchema = z.object({
  skill: z
    .string()
    .min(1)
    .describe(
      "Skill name or id (e.g. 'Rust', 'kubernetes', 'Machine Learning'). " +
        "Aliases resolve via codex/skills.json.",
    ),
  months: z
    .number()
    .int()
    .min(1)
    .max(24)
    .optional()
    .describe("Months of history (default 12, max 24)"),
});

export const getSkillHistoryTool: Tool = {
  name: "get_skill_history",
  description:
    "Time-series of a skill's market adoption. Pro+ tier. Returns monthly " +
    "companyCount + jobMentions for the skill, top companies hiring for it " +
    "each month, and computed MoM deltas. Use for 'how fast is Rust " +
    "adoption growing?' or 'is React still dominant?'.",
  inputSchema,
  handler: async (args, ctx) => {
    const deps = {
      ctx,
      citationUrl: siteUrl("/skills/trending/"),
      toolLabel: "get_skill_history",
    };
    const auth = requireUser(deps);
    if ("error" in auth) return auth.error;
    try {
      const data = await apiGet("/analyst/history/skill", args, { authToken: auth.token });
      return proResult(data, deps.citationUrl);
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};
