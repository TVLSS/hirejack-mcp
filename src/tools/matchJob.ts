import { z } from "zod";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import { toolError } from "../lib/format.js";
import { apiGetJobVariants, jobCitationUrl, resolveJobRef } from "../lib/jobRef.js";
import type { Tool } from "../registry.js";

const inputSchema = z
  .object({
    domain: z
      .string()
      .optional()
      .describe("Company domain (e.g. 'stripe.com'). Required unless `url` is provided."),
    jobId: z
      .string()
      .optional()
      .describe(
        "Pass the `id` field from a `search_jobs` result VERBATIM — do not " +
          "reformat, do not replace `#` with `-`. The id is the literal value " +
          "search_jobs returned (e.g. 'greenhouse#stripe#4921361'). Always " +
          "fetch a real id via search_jobs first since postings rotate. " +
          "Required unless `url` is provided.",
      ),
    url: z
      .string()
      .optional()
      .describe(
        "Full HireJack job detail URL (e.g. 'https://hirejack.com/jobs/stripe.com/sw-eng-12345/'). " +
          "Convenience alternative to passing `domain` + `jobId` separately.",
      ),
  })
  .refine((v) => v.url || (v.domain && v.jobId), {
    message: "Provide either `url` OR both `domain` and `jobId`.",
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
    const ref = resolveJobRef(args);
    if ("error" in ref) return toolError(ref.error);
    const deps = {
      ctx,
      citationUrl: jobCitationUrl(ref.domain, ref.jobId),
      toolLabel: "match_job",
    };
    const auth = requireUser(deps);
    if ("error" in auth) return auth.error;
    try {
      const data = await apiGetJobVariants("/job-match", ref.domain, ref.jobId, auth.token);
      return proResult(data, deps.citationUrl);
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};
