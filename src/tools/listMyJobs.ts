import { z } from "zod";
import { apiGet } from "../lib/api.js";
import { envelopeSchema } from "../lib/format.js";
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
    .describe("Max entries to return (1-100, default 50, newest first)."),
});

type Args = z.infer<typeof inputSchema>;

const rowSchema = z
  .object({
    title: z.string().nullable().optional(),
    company: z.string().optional(),
    domain: z.string().optional().describe("Company domain — pairs with jobId for get_job / match_job / save_job / track_application"),
    jobId: z.string().optional().describe("Canonical job id in the same form the write tools accept"),
    seniority: z.string().optional().describe("intern|junior|mid|senior|staff|principal|manager|director|vp"),
    family: z.string().optional().describe("Role family, e.g. 'software_engineering'"),
    savedAt: z.string().optional().describe("YYYY-MM-DD (list_saved_jobs)"),
    appliedAt: z.string().optional().describe("YYYY-MM-DD (list_applications)"),
    stage: z.string().optional().describe("applied|phone_screen|interview|offer|rejected|withdrawn (list_applications)"),
    listingRemoved: z.boolean().optional().describe("Present (true) when the posting is no longer in the index"),
    listingExpired: z.boolean().optional().describe("Present (true) when the posting is past its validThrough"),
  })
  .passthrough();

const listOutputSchema = (what: string) =>
  envelopeSchema(
    z
      .object({
        total: z.number().optional().describe("Total entries on the user's list"),
        returned: z.number().optional().describe("Entries in this response (after limit)"),
        jobs: z.array(rowSchema).optional().describe("Newest first"),
      })
      .passthrough(),
    what,
  );

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
    "review/prune their shortlist. Not for application-pipeline status — " +
    "use `list_applications` for that.",
  inputSchema,
  outputSchema: listOutputSchema("The user's saved (bookmarked) jobs"),
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
    "or before moving an application to a new stage. Not for the saved/" +
    "bookmarked list — use `list_saved_jobs` for that.",
  inputSchema,
  outputSchema: listOutputSchema("The user's tracked applications with pipeline stage"),
  annotations: { readOnlyHint: true, idempotentHint: true },
  handler: (args: Args, ctx) => listEndpoint("/applied", "list_applications", args, ctx),
};
