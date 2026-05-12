// Transport-agnostic tool registry. Both stdio (src/index.ts) and Lambda
// (src/lambda.ts) consume this same set of tool definitions.

import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { searchJobsTool } from "./tools/searchJobs.js";
import { getCompanyProfileTool } from "./tools/getCompanyProfile.js";
import { searchCompaniesTool } from "./tools/searchCompanies.js";
import { getMarketPulseTool } from "./tools/getMarketPulse.js";
import { matchJobTool } from "./tools/matchJob.js";
import { companyFitTool } from "./tools/companyFit.js";
import { recommendationsTool } from "./tools/recommendations.js";
import { salaryBenchmarkTool } from "./tools/salaryBenchmark.js";
import { skillGapTool } from "./tools/skillGap.js";
import { resumeRewriteTool } from "./tools/resumeRewrite.js";
import { interviewPrepTool } from "./tools/interviewPrep.js";
import { getCompanyHistoryTool } from "./tools/getCompanyHistory.js";
import { getSkillHistoryTool } from "./tools/getSkillHistory.js";
import { getMarketHistoryTool } from "./tools/getMarketHistory.js";
import { compareCompaniesTool } from "./tools/compareCompanies.js";
import { findCompaniesTool } from "./tools/findCompanies.js";
import { findBreakoutCompaniesTool } from "./tools/findBreakoutCompanies.js";
import { findEmergingSkillsTool } from "./tools/findEmergingSkills.js";

export type ToolContent = {
  type: "text";
  text: string;
};

export type ToolResponse = {
  content: ToolContent[];
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
  handler: (args: any, ctx: ToolContext) => Promise<ToolResponse>;
};

export const TOOLS: Tool[] = [
  // Public — no auth required
  searchJobsTool,
  getCompanyProfileTool,
  searchCompaniesTool,
  getMarketPulseTool,
  // Pro+ — require an authenticated user (OAuth)
  matchJobTool,
  companyFitTool,
  recommendationsTool,
  salaryBenchmarkTool,
  skillGapTool,
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
];

const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

export function listTools() {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(t.inputSchema, {
      $refStrategy: "none",
      target: "openApi3",
    }),
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
  const parsed = tool.inputSchema.safeParse(args ?? {});
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
  version: "0.4.0",
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
