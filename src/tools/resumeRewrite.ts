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
      "Canonical job id from `search_jobs` results (e.g. 'greenhouse-stripe-7809397')",
    ),
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
    const deps = {
      ctx,
      citationUrl: siteUrl(`/jobs/${args.domain}/${args.jobId}/`),
      toolLabel: "resume_rewrite",
      premium: true,
    };
    const auth = requireUser(deps);
    if ("error" in auth) return auth.error;
    try {
      const data = await apiGet("/resume-rewrite", args, { authToken: auth.token });
      return proResult(data, deps.citationUrl);
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};
