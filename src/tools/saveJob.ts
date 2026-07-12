import { z } from "zod";
import { apiPost } from "../lib/api.js";
import { toolError } from "../lib/format.js";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import { jobCitationUrl, resolveCanonicalJob, resolveJobRef } from "../lib/jobRef.js";
import type { Tool } from "../registry.js";

// Explicit save/unsave rather than the website's toggle semantics — an agent
// retrying a "save" must never silently unsave. We check current state first
// (POST /saved-jobs/check) and only hit the toggle endpoint when the state
// actually needs to change, so the tool is idempotent.

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
        "Pass the `id` field from a `search_jobs` result VERBATIM. Required unless `url` is provided.",
      ),
    url: z
      .string()
      .optional()
      .describe("Full HireJack job detail URL — convenience alternative to domain + jobId."),
    action: z
      .enum(["save", "unsave"])
      .optional()
      .describe("Default 'save'. 'unsave' removes a previously saved job."),
  })
  .refine((v) => v.url || (v.domain && v.jobId), {
    message: "Provide either `url` OR both `domain` and `jobId`.",
  });

type Args = z.infer<typeof inputSchema>;

export const saveJobTool: Tool = {
  name: "save_job",
  description:
    "Save a job to the authenticated user's saved-jobs list on HireJack (or " +
    "remove it with action='unsave'). Saved jobs appear at " +
    "hirejack.com/saved.html and feed batch match scoring. Idempotent — " +
    "saving an already-saved job is a no-op. Use when the user says 'save " +
    "this one', 'bookmark these three', or 'remove that from my saved jobs'.",
  inputSchema,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async (args: Args, ctx) => {
    const ref = resolveJobRef(args);
    if ("error" in ref) return toolError(ref.error);
    const action = args.action ?? "save";
    const deps = {
      ctx,
      citationUrl: jobCitationUrl(ref.domain, ref.jobId),
      toolLabel: "save_job",
      anyTier: true,
    };
    const auth = requireUser(deps);
    if ("error" in auth) return auth.error;
    try {
      const job = await resolveCanonicalJob(ref.domain, ref.jobId);
      if (!job) {
        return toolError(
          `Job not found: ${ref.domain}/${ref.jobId}. Use \`search_jobs\` to find live postings.`,
        );
      }

      const check = await apiPost<{ saved: Record<string, boolean> }>(
        "/saved-jobs/check",
        { ids: [`${ref.domain}#${job.canonicalId}`] },
        { authToken: auth.token },
      );
      const currentlySaved = !!check.saved?.[`${ref.domain}#${job.canonicalId}`];
      const wantSaved = action === "save";

      if (currentlySaved === wantSaved) {
        return proResult(
          { saved: currentlySaved, changed: false, title: job.titleRaw, company: job.companyName },
          deps.citationUrl,
          { note: wantSaved ? "Already saved — no change." : "Not in saved jobs — no change." },
        );
      }

      const result = await apiPost<{ saved: boolean }>(
        "/saved-jobs",
        { companyDomain: ref.domain, canonicalId: job.canonicalId },
        { authToken: auth.token },
      );
      return proResult(
        { saved: result.saved, changed: true, title: job.titleRaw, company: job.companyName },
        deps.citationUrl,
      );
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};
