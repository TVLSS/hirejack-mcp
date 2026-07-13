import { z } from "zod";
import { apiGet } from "../lib/api.js";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import type { Tool } from "../registry.js";

// Read-back companions to the account-action write tools: save_job writes,
// list_saved_jobs reads; track_application writes, list_applications reads.
// Without these, an agent that just saved three jobs can't answer "what have
// I saved?" — the gap surfaced the first time someone rehearsed that exact
// conversation.

type SavedRow = {
  companyDomain: string;
  canonicalId: string;
  companyName?: string;
  titleRaw?: string;
  seniority?: string;
  family?: string;
  savedAt?: string;
  appliedAt?: string;
  stage?: string;
  stale?: boolean;
  expired?: boolean;
  expiredAt?: string;
};

const inputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Max entries to return (default 50, newest first)."),
});

type Args = z.infer<typeof inputSchema>;

function slimRow(j: SavedRow) {
  return {
    title: j.titleRaw || null,
    company: j.companyName || j.companyDomain,
    domain: j.companyDomain,
    // Same id form the write tools accept — chain into get_job / match_job /
    // save_job(action='unsave') / track_application without re-searching.
    jobId: j.canonicalId,
    ...(j.seniority ? { seniority: j.seniority } : {}),
    ...(j.family ? { family: j.family } : {}),
    ...(j.savedAt ? { savedAt: j.savedAt.slice(0, 10) } : {}),
    ...(j.appliedAt ? { appliedAt: j.appliedAt.slice(0, 10) } : {}),
    ...(j.stage ? { stage: j.stage } : {}),
    // stale = posting no longer in the index; expired = still shown but past
    // its validThrough. Surface both so the agent can say "this one closed".
    ...(j.stale ? { listingRemoved: true } : {}),
    ...(j.expired ? { listingExpired: true } : {}),
  };
}

async function listEndpoint(
  path: "/saved-jobs" | "/applied",
  label: "list_saved_jobs" | "list_applications",
  args: Args,
  ctx: Parameters<Tool["handler"]>[1],
) {
  const citationUrl = "https://hirejack.com/saved.html";
  const deps = { ctx, citationUrl, toolLabel: label, anyTier: true };
  const auth = requireUser(deps);
  if ("error" in auth) return auth.error;
  try {
    const resp = await apiGet<{ jobs: SavedRow[]; count: number }>(
      path,
      {},
      { authToken: auth.token },
    );
    const limit = args.limit ?? 50;
    const rows = (resp.jobs || []).slice(0, limit).map(slimRow);
    return proResult({ total: resp.count ?? rows.length, returned: rows.length, jobs: rows }, citationUrl);
  } catch (e) {
    return handleApiError(e, deps);
  }
}

export const listSavedJobsTool: Tool = {
  name: "list_saved_jobs",
  description:
    "List the authenticated user's saved jobs on HireJack, newest first — " +
    "the read companion to `save_job`. Returns title, company, ids (reusable " +
    "with get_job/match_job/save_job), and flags for postings that have since " +
    "closed. Use when the user asks 'what jobs have I saved?' or wants to " +
    "review/prune their shortlist.",
  inputSchema,
  annotations: { readOnlyHint: true, idempotentHint: true },
  handler: (args: Args, ctx) => listEndpoint("/saved-jobs", "list_saved_jobs", args, ctx),
};

export const listApplicationsTool: Tool = {
  name: "list_applications",
  description:
    "List the authenticated user's tracked job applications with their " +
    "pipeline stage (applied / phone_screen / interview / offer / rejected / " +
    "withdrawn), newest first — the read companion to `track_application`. " +
    "Use when the user asks 'what's in my pipeline?', 'where did I apply?', " +
    "or before moving an application to a new stage.",
  inputSchema,
  annotations: { readOnlyHint: true, idempotentHint: true },
  handler: (args: Args, ctx) => listEndpoint("/applied", "list_applications", args, ctx),
};
