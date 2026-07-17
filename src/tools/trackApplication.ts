import { z } from "zod";
import { apiPost } from "../lib/api.js";
import { toolError } from "../lib/format.js";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import { jobCitationUrl, resolveCanonicalJob, resolveJobRef } from "../lib/jobRef.js";
import type { Tool } from "../registry.js";

// The website endpoint is a toggle (POST with no stage/notes on an existing
// entry DELETES it). This tool always sends an explicit stage on writes so a
// retried "mark applied" can never silently un-track an application; removal
// is its own explicit action gated on a state check.

const STAGES = ["applied", "phone_screen", "interview", "offer", "rejected", "withdrawn"] as const;

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
    stage: z
      .enum(STAGES)
      .optional()
      .describe(
        "Pipeline stage (default 'applied'). Set later stages as the process " +
          "advances: phone_screen, interview, offer, rejected, withdrawn.",
      ),
    notes: z
      .string()
      .max(2000)
      .optional()
      .describe("Free-text notes to attach to this application (interviewer names, dates, etc.)."),
    remove: z
      .boolean()
      .optional()
      .describe("true = un-track this application entirely (removes it from the pipeline board)."),
  })
  .refine((v) => v.url || (v.domain && v.jobId), {
    message: "Provide either `url` OR both `domain` and `jobId`.",
  });

type Args = z.infer<typeof inputSchema>;

export const trackApplicationTool: Tool = {
  name: "track_application",
  description:
    "Track a job application in the authenticated user's pipeline on " +
    "HireJack — mark a job applied, advance its stage (applied → " +
    "phone_screen → interview → offer / rejected / withdrawn), attach " +
    "notes, or un-track it with remove=true. Powers the Kanban pipeline at " +
    "hirejack.com/saved.html. Use when the user says 'I applied to this', " +
    "'move Stripe to interview', or 'log that I got an offer'. Not for " +
    "mere bookmarking without applying — use `save_job` for that.",
  inputSchema,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async (args: Args, ctx) => {
    const ref = resolveJobRef(args);
    if ("error" in ref) return toolError(ref.error);
    const deps = {
      ctx,
      citationUrl: jobCitationUrl(ref.domain, ref.jobId),
      toolLabel: "track_application",
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
      const id = `${ref.domain}#${job.canonicalId}`;

      if (args.remove) {
        const check = await apiPost<{ applied: Record<string, unknown> }>(
          "/applied/check",
          { ids: [id] },
          { authToken: auth.token },
        );
        if (!check.applied?.[id]) {
          return proResult(
            { applied: false, changed: false, title: job.titleRaw, company: job.companyName },
            deps.citationUrl,
            { note: "Not currently tracked — no change." },
          );
        }
        // Toggle-off: POST with neither stage nor notes deletes the entry.
        const result = await apiPost<{ applied: boolean }>(
          "/applied",
          { companyDomain: ref.domain, canonicalId: job.canonicalId },
          { authToken: auth.token },
        );
        return proResult(
          { applied: result.applied, changed: true, title: job.titleRaw, company: job.companyName },
          deps.citationUrl,
        );
      }

      // Create-or-update: an explicit stage is always sent, so an existing
      // entry is updated in place rather than toggled off.
      const stage = args.stage ?? "applied";
      const result = await apiPost<{ applied: boolean; stage?: string; updated?: boolean }>(
        "/applied",
        {
          companyDomain: ref.domain,
          canonicalId: job.canonicalId,
          stage,
          ...(args.notes ? { notes: args.notes } : {}),
        },
        { authToken: auth.token },
      );
      return proResult(
        {
          applied: result.applied,
          stage: result.stage ?? stage,
          updated: result.updated ?? false,
          title: job.titleRaw,
          company: job.companyName,
        },
        deps.citationUrl,
      );
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};
