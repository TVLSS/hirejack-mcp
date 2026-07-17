import { z } from "zod";
import { apiGet, siteUrl } from "../lib/api.js";
import { envelopeSchema } from "../lib/format.js";
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
    .describe(
      "Months of history to return (1-24, default 12). Monthly snapshots " +
        "began March 2026, so depth is capped by available history.",
    ),
});

export const getSkillHistoryTool: Tool = {
  name: "get_skill_history",
  description:
    "Time-series of a skill's market adoption. " + "Analyst tier." + " Returns monthly " +
    "companyCount + jobMentions for the skill, top companies hiring for it " +
    "each month, and computed MoM deltas. Use for 'how fast is Rust " +
    "adoption growing?' or 'is React still dominant?'. Not for discovering " +
    "early-stage skills you can't yet name — use `find_emerging_skills` " +
    "for that.",
  inputSchema,
  outputSchema: envelopeSchema(
    z
      .object({
        skill: z.string().optional().describe("The skill as passed in"),
        skillId: z.string().optional().describe("Resolved canonical skill id"),
        snapshots: z
          .array(
            z
              .object({
                month: z.string().optional().describe("YYYY-MM"),
                companyCount: z.number().optional().describe("Companies mentioning the skill that month"),
                jobMentions: z.number().optional().describe("Job postings mentioning it"),
                topCompanies: z.array(z.object({}).passthrough()).optional().describe("Top companies hiring for it (capped at 10)"),
                companyCountDelta: z.number().optional().describe("MoM change in companyCount (absent on the first snapshot)"),
                jobMentionsPctChange: z.number().nullable().optional().describe("MoM % change in jobMentions; null when the prior month had 0"),
              })
              .passthrough(),
          )
          .optional()
          .describe("Monthly adoption snapshots, oldest first"),
      })
      .passthrough(),
    "Monthly market-adoption history for one skill",
  ),
  handler: async (args, ctx) => {
    const deps = {
      ctx,
      citationUrl: siteUrl("/skills/trending/"),
      toolLabel: "get_skill_history",
      analyst: true,
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
