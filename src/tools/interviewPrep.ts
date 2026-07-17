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
      .describe("Company domain (e.g. 'anthropic.com'). Required unless `url` is provided."),
    jobId: z
      .string()
      .optional()
      .describe(
        "Pass the `id` field from a `search_jobs` result VERBATIM — do not " +
          "reformat (ids may contain '#' separators; keep them). Required " +
          "unless `url` is provided.",
      ),
    url: z
      .string()
      .optional()
      .describe(
        "Full HireJack job detail URL. Convenience alternative to passing " +
          "`domain` + `jobId` separately.",
      ),
  })
  .refine((v) => v.url || (v.domain && v.jobId), {
    message: "Provide either `url` OR both `domain` and `jobId`.",
  });

export const interviewPrepTool: Tool = {
  name: "interview_prep",
  description:
    "Generate targeted interview prep for a specific job: 5 key topics " +
    "(deep vs surface depth based on job seniority), 5 likely questions by " +
    "type (technical, behavioral, system design) with answer tips, and 3 " +
    "company-specific research items. " + "Premium tier." + " Uses job description + " +
    "company tech stack + user skills as context. Use for 'help me prep for " +
    "my Anthropic interview' or 'what should I expect in this loop?'. Not " +
    "for resume tailoring — use `resume_rewrite` for that.",
  inputSchema,
  handler: async (args, ctx) => {
    const ref = resolveJobRef(args);
    if ("error" in ref) return toolError(ref.error);
    const deps = {
      ctx,
      citationUrl: jobCitationUrl(ref.domain, ref.jobId),
      toolLabel: "interview_prep",
      premium: true,
    };
    const auth = requireUser(deps);
    if ("error" in auth) return auth.error;
    try {
      const data = await apiGetJobVariants("/interview-prep", ref.domain, ref.jobId, auth.token);
      return proResult(data, deps.citationUrl);
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};
