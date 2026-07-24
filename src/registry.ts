// Transport-agnostic tool registry. Both stdio (src/index.ts) and Lambda
// (src/lambda.ts) consume this same set of tool definitions.

import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { searchJobsTool } from "./tools/searchJobs.js";
import { getJobTool } from "./tools/getJob.js";
import { getCompanyProfileTool } from "./tools/getCompanyProfile.js";
import { searchCompaniesTool } from "./tools/searchCompanies.js";
import { getMarketPulseTool } from "./tools/getMarketPulse.js";
import { matchJobTool } from "./tools/matchJob.js";
import { companyFitTool } from "./tools/companyFit.js";
import { recommendationsTool } from "./tools/recommendations.js";
import { salaryBenchmarkTool } from "./tools/salaryBenchmark.js";
import { skillGapTool } from "./tools/skillGap.js";
import { marketPositionTool } from "./tools/marketPosition.js";
import { skillImpactTool } from "./tools/skillImpact.js";
import { watchlistIntelligenceTool } from "./tools/watchlistIntelligence.js";
import { resumeRewriteTool } from "./tools/resumeRewrite.js";
import { interviewPrepTool } from "./tools/interviewPrep.js";
import { getCompanyHistoryTool } from "./tools/getCompanyHistory.js";
import { getSkillHistoryTool } from "./tools/getSkillHistory.js";
import { getMarketHistoryTool } from "./tools/getMarketHistory.js";
import { compareCompaniesTool } from "./tools/compareCompanies.js";
import { findCompaniesTool } from "./tools/findCompanies.js";
import { findBreakoutCompaniesTool } from "./tools/findBreakoutCompanies.js";
import { findEmergingSkillsTool } from "./tools/findEmergingSkills.js";
import { findEmergingRolesTool } from "./tools/findEmergingRoles.js";
import { saveJobTool } from "./tools/saveJob.js";
import { watchCompanyTool } from "./tools/watchCompany.js";
import { trackApplicationTool } from "./tools/trackApplication.js";
import { listSavedJobsTool, listApplicationsTool } from "./tools/listMyJobs.js";
import { listWatchlistTool } from "./tools/listWatchlist.js";
import { getProfileTool, updatePreferencesTool } from "./tools/profile.js";

export type ToolContent = {
  type: "text";
  text: string;
};

export type ToolResponse = {
  content: ToolContent[];
  /** Machine-readable copy of the payload (same envelope the text content
   *  stringifies). For tools that declare an outputSchema, successful results
   *  MUST include this per the MCP spec; toolResult() attaches it uniformly. */
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

/** Per-call context. `userId` is set when the caller authenticated via OAuth
 *  (downstream tools mint an internal JWT to forward identity). For the
 *  shared bearer token path or stdio (no auth), `userId` is undefined and
 *  Pro+ tools surface a clear "auth required" error. */
export type ToolContext = {
  userId?: string;
  scope?: string;
  source?: "oauth" | "shared" | "stdio";
  /** Registered OAuth client_id of the calling MCP client (e.g. Claude
   *  Desktop). Used for per-client analytics. */
  clientId?: string;
};

// Storage type — variance-erased so tools with different ZodObject shapes
// can sit in the same array. Tools keep their narrow types locally via
// `z.infer<typeof inputSchema>` and assign-widen to this on export.
export type Tool = {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  /** Optional result schema, serialized to JSON Schema in tools/list. Keep
   *  these permissive (optional fields + passthrough objects). */
  outputSchema?: z.ZodTypeAny;
  handler: (args: any, ctx: ToolContext) => Promise<ToolResponse>;
  /** Per-tool annotation overrides. Defaults (readOnlyHint: true) fit the
   *  query tools; the account-action tools (save_job, watch_company,
   *  track_application) set readOnlyHint: false so clients surface them for
   *  approval correctly. */
  annotations?: {
    readOnlyHint?: boolean;
    idempotentHint?: boolean;
    destructiveHint?: boolean;
  };
};

export const TOOLS: Tool[] = [
  // Public — no auth required
  searchJobsTool,
  getJobTool,
  getCompanyProfileTool,
  searchCompaniesTool,
  getMarketPulseTool,
  // Pro+ — require an authenticated user (OAuth)
  matchJobTool,
  companyFitTool,
  recommendationsTool,
  salaryBenchmarkTool,
  skillGapTool,
  marketPositionTool,
  skillImpactTool,
  watchlistIntelligenceTool,
  // Premium — also require Premium tier (gated server-side)
  resumeRewriteTool,
  interviewPrepTool,
  // Analyst — historical / segmentation / comparison. Pro+ tier today;
  // tightens to a dedicated 'analyst' tier when that pricing plan ships.
  getCompanyHistoryTool,
  getSkillHistoryTool,
  getMarketHistoryTool,
  compareCompaniesTool,
  findCompaniesTool,
  findBreakoutCompaniesTool,
  findEmergingSkillsTool,
  findEmergingRolesTool,
  // Account actions — write tools (readOnlyHint: false). Any authenticated
  // tier; idempotent explicit-action semantics over the website's toggles.
  // Like all authenticated tools, they require the hosted OAuth endpoint —
  // in stdio they surface a clear pointer to https://hirejack.com/api/mcp.
  saveJobTool,
  watchCompanyTool,
  trackApplicationTool,
  // Account reads — companions to the writes above (any authenticated tier).
  listSavedJobsTool,
  listApplicationsTool,
  listWatchlistTool,
  // Profile — read the user's matching context; write their preferences.
  getProfileTool,
  updatePreferencesTool,
];

const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

// Human-friendly title derived from the tool name ("search_jobs" → "Search
// Jobs"). All HireJack tools are read-only queries against our own API, so
// they uniformly get readOnlyHint (clients use it to reduce approval
// friction) and openWorldHint: false (closed domain — no external services).
function titleFromName(name: string): string {
  return name
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function listTools() {
  return TOOLS.map((t) => ({
    name: t.name,
    title: titleFromName(t.name),
    description: t.description,
    inputSchema: zodToJsonSchema(t.inputSchema, {
      $refStrategy: "none",
      target: "openApi3",
    }),
    ...(t.outputSchema
      ? {
          outputSchema: zodToJsonSchema(t.outputSchema, {
            $refStrategy: "none",
            target: "openApi3",
          }),
        }
      : {}),
    annotations: {
      title: titleFromName(t.name),
      readOnlyHint: t.annotations?.readOnlyHint ?? true,
      openWorldHint: false,
      ...(t.annotations?.idempotentHint !== undefined ? { idempotentHint: t.annotations.idempotentHint } : {}),
      ...(t.annotations?.destructiveHint !== undefined ? { destructiveHint: t.annotations.destructiveHint } : {}),
    },
  }));
}

export async function callTool(
  name: string,
  args: unknown,
  ctx: ToolContext = {},
): Promise<ToolResponse> {
  const tool = TOOLS_BY_NAME.get(name);
  if (!tool) {
    return {
      isError: true,
      content: [
        { type: "text", text: JSON.stringify({ error: `Unknown tool: ${name}` }) },
      ],
    };
  }
  // Some clients send scalar/null args for zero-parameter tools (observed in
  // production: get_market_pulse called with a bare number). Every tool
  // schema is an object, so coerce non-object args to {} — schemas with
  // required keys still fail with a clear per-field message below.
  const normalizedArgs =
    args !== null && typeof args === "object" && !Array.isArray(args) ? args : {};
  const parsed = tool.inputSchema.safeParse(normalizedArgs);
  if (!parsed.success) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "Invalid arguments",
            details: parsed.error.issues,
          }),
        },
      ],
    };
  }
  return tool.handler(parsed.data, ctx);
}

export const SERVER_INFO = {
  name: "hirejack",
  title: "HireJack",
  version: "0.3.7", // keep in lockstep with package.json + server.json on each release
  icons: [
    {
      src: "https://hirejack.com/apple-touch-icon.png",
      mimeType: "image/png",
      sizes: ["180x180"],
    },
    {
      src: "https://hirejack.com/favicon.ico",
      mimeType: "image/x-icon",
      sizes: ["16x16"],
    },
  ],
  websiteUrl: "https://hirejack.com",
};

export const SERVER_INSTRUCTIONS =
  "HireJack: tech job market intelligence. Query open jobs, company hiring " +
  "profiles, and aggregate market stats across ~500 tech companies and 80K+ " +
  "live job postings. When citing data in responses, link the citation_url " +
  "returned by each tool.";
