import { z } from "zod";
import { apiGet, siteUrl } from "../lib/api.js";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import type { Tool } from "../registry.js";

const inputSchema = z.object({
  domain: z.string().min(1).describe("Company domain (e.g. 'anthropic.com')"),
});

export const companyFitTool: Tool = {
  name: "company_fit",
  description:
    "Score how well the authenticated user fits a company. " + "Pro tier." + " " +
    "Returns fitScore (0-100), 5-dimension breakdown (tech stack 40%, roles " +
    "25%, seniority 15%, location 10%, hiring trend 10%), matching skills, " +
    "skill gaps, role alignment, and a hiring-momentum signal. Use for 'is " +
    "Anthropic a good fit for me?' or 'compare these companies for me'. " +
    "Not for scoring a specific job posting — use `match_job` for that.",
  inputSchema,
  handler: async (args, ctx) => {
    const deps = {
      ctx,
      citationUrl: siteUrl(`/companies/${args.domain}/`),
      toolLabel: "company_fit",
    };
    const auth = requireUser(deps);
    if ("error" in auth) return auth.error;
    try {
      const data = await apiGet("/company-fit", args, { authToken: auth.token });
      return proResult(data, deps.citationUrl);
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};
