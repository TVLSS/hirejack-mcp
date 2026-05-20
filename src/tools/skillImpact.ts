import { z } from "zod";
import { apiGet, siteUrl } from "../lib/api.js";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import type { Tool } from "../registry.js";

const inputSchema = z.object({});

export const skillImpactTool: Tool = {
  name: "skill_impact",
  description:
    "For each skill the authenticated user does NOT have, simulate adding it " +
    "and compute the market impact. Pro tier. Returns a ranked list of " +
    "skills with: newJobsUnlocked (jobs that previously didn't match but " +
    "would after learning the skill), boostedJobs (existing matches that " +
    "would score higher), companiesNeedingIt, relevantRoles, and a composite " +
    "impactScore. Also returns profileCompleteness so the caller can suggest " +
    "filling missing profile fields. Use for queries like 'what should I " +
    "learn next?' or 'which skill would unlock the most jobs for me?'.",
  inputSchema,
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
