import { z } from "zod";
import { apiGet, siteUrl } from "../lib/api.js";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import type { Tool } from "../registry.js";

const inputSchema = z.object({
  domain: z.string().min(1).describe("Company domain (e.g. 'stripe.com')"),
  jobId: z
    .string()
    .min(1)
    .describe(
      "Canonical job id. Use the `id` field from `search_jobs` results — " +
        "e.g. 'greenhouse-stripe-7809397'.",
    ),
});

export const matchJobTool: Tool = {
  name: "match_job",
  description:
    "Score how well the authenticated user matches a specific job. Pro tier. " +
    "Returns matchPct (0-100), 5-dimension breakdown (skills 50%, role 20%, " +
    "seniority 10%, location 10%, remote 10%), matched/missing/bonus skill " +
    "lists, ATS-specific resume tips for the company's ATS, and a " +
    "priorityScore that factors hiring velocity. Use for queries like 'how " +
    "well do I match this job?' or 'should I apply?'.",
  inputSchema,
  handler: async (args, ctx) => {
    const deps = {
      ctx,
      citationUrl: siteUrl(`/jobs/${args.domain}/${args.jobId}/`),
      toolLabel: "match_job",
    };
    const auth = requireUser(deps);
    if ("error" in auth) return auth.error;
    try {
      const data = await apiGet("/job-match", args, { authToken: auth.token });
      return proResult(data, deps.citationUrl);
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};
