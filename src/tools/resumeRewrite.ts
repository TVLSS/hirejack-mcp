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
          "reformat (the id contains '#' separators; keep them). Always fetch " +
          "a real id via search_jobs first. Required unless `url` is provided.",
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

export const resumeRewriteTool: Tool = {
  name: "resume_rewrite",
  description:
    "Generate targeted resume bullet rewrites for a specific job, using the " +
    "user's uploaded resume + the job description as context. Premium tier. " +
    "Returns before/after bullet rewrites, missing keywords from the JD, " +
    "and ATS-format tips. The user must have a resume uploaded to HireJack " +
    "(via Settings or Onboarding). Use for 'rewrite my resume for this " +
    "Stripe role' or 'tailor my bullets for this JD'.",
  inputSchema,
  handler: async (args, ctx) => {
    const ref = resolveJobRef(args);
    if ("error" in ref) return toolError(ref.error);
    const deps = {
      ctx,
      citationUrl: jobCitationUrl(ref.domain, ref.jobId),
      toolLabel: "resume_rewrite",
      premium: true,
    };
    const auth = requireUser(deps);
    if ("error" in auth) return auth.error;
    try {
      const data = await apiGetJobVariants("/resume-rewrite", ref.domain, ref.jobId, auth.token);
      return proResult(data, deps.citationUrl);
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};
