import { z } from "zod";
import { apiGet, siteUrl } from "../lib/api.js";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import type { Tool } from "../registry.js";

const inputSchema = z.object({
  domain: z.string().min(1).describe("Company domain (e.g. 'anthropic.com')"),
  jobId: z
    .string()
    .min(1)
    .describe(
      "Canonical job id from `search_jobs` results (e.g. 'ashby-anthropic-abc123')",
    ),
});

export const interviewPrepTool: Tool = {
  name: "interview_prep",
  description:
    "Generate targeted interview prep for a specific job: 5 key topics " +
    "(deep vs surface depth based on job seniority), 5 likely questions by " +
    "type (technical, behavioral, system design) with answer tips, and 3 " +
    "company-specific research items. Premium tier. Uses job description + " +
    "company tech stack + user skills as context. Use for 'help me prep for " +
    "my Anthropic interview' or 'what should I expect in this loop?'.",
  inputSchema,
  handler: async (args, ctx) => {
    const deps = {
      ctx,
      citationUrl: siteUrl(`/jobs/${args.domain}/${args.jobId}/`),
      toolLabel: "interview_prep",
      premium: true,
    };
    const auth = requireUser(deps);
    if ("error" in auth) return auth.error;
    try {
      const data = await apiGet("/interview-prep", args, { authToken: auth.token });
      return proResult(data, deps.citationUrl);
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};
