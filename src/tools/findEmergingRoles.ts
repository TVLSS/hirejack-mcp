import { z } from "zod";
import { apiGet, siteUrl } from "../lib/api.js";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import type { Tool } from "../registry.js";

const inputSchema = z.object({
  windowDays: z.coerce
    .number()
    .int()
    .min(7)
    .max(90)
    .optional()
    .describe(
      "Growth window in days (default 21). Company adoption today is compared " +
        "against the newest daily snapshot at or before this many days ago. " +
        "The daily rollup began 2026-07-03 (90-day retention) — if the history " +
        "is younger than the window, growth is measured over the available span " +
        "and the response says so.",
    ),
  minCompanies: z.coerce
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Minimum companies that must currently post the role (default 5)."),
  minDelta: z.coerce
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      "Minimum ABSOLUTE company-count gain over the window (default 2). " +
        "Filters small-base noise.",
    ),
  growthMin: z.coerce
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Minimum growth percentage over the window (default 25)."),
  limit: z.coerce.number().int().min(1).max(50).optional().describe("Max roles to return (default 20)"),
});

export const findEmergingRolesTool: Tool = {
  name: "find_emerging_roles",
  description:
    "Job roles gaining company adoption — which titles are spreading across " +
    "the market. Analyst tier. Compares each canonical role's " +
    "company count today against a daily rollup snapshot windowDays ago " +
    "(default 21) and returns roles that cleared the growth thresholds, " +
    "plus genuinely NEW titles the classifier just started seeing (how " +
    "'Forward Deployed Engineer' was first caught). Use for 'what roles " +
    "are companies suddenly hiring for?' or 'is the AI-engineer title " +
    "spreading?'. Defaults: windowDays 21, minCompanies 5, minDelta 2, " +
    "growthMin 25%, limit 20. Companion: find_emerging_skills for the " +
    "skill-level signal.",
  inputSchema,
  handler: async (args, ctx) => {
    const deps = {
      ctx,
      citationUrl: siteUrl("/roles/emerging/"),
      toolLabel: "find_emerging_roles",
    };
    const auth = requireUser(deps);
    if ("error" in auth) return auth.error;
    try {
      const data = await apiGet("/analyst/find-emerging-roles", args, { authToken: auth.token });
      return proResult(data, deps.citationUrl);
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};
