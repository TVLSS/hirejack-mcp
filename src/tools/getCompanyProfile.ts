import { z } from "zod";
import { apiGet, siteUrl, ApiError } from "../lib/api.js";
import { toolResult, toolError } from "../lib/format.js";
import type { Tool } from "../registry.js";

const inputSchema = z.object({
  domain: z
    .string()
    .min(1)
    .describe(
      "Company domain (e.g. 'stripe.com', 'anthropic.com'). Use the apex domain, not subdomains.",
    ),
});

type Args = z.infer<typeof inputSchema>;

type CompanyProfile = Record<string, unknown> & {
  domain?: string;
  companyName?: string;
  industry?: string;
  totalJobs?: number;
};

export const getCompanyProfileTool: Tool = {
  name: "get_company_profile",
  description:
    "Fetch HireJack's full hiring profile for a single company by domain. " +
    "Returns: tech stack (top skills with counts), role distribution, " +
    "seniority breakdown, location breakdown, hiring trend (% MoM), " +
    "salary medians where disclosed, and an AI-generated hiring brief. " +
    "Use this for queries like 'what is Stripe hiring?', 'what tech does " +
    "Anthropic use?', or before comparing companies. Not for historical " +
    "trends (`get_company_history`, Analyst) or the user's personal fit " +
    "(`company_fit`).",
  inputSchema,
  handler: async ({ domain }: Args) => {
    try {
      const profile = await apiGet<CompanyProfile>(
        `/companies/${encodeURIComponent(domain)}`,
      );
      return toolResult({
        data: slimProfile(profile),
        citation_url: siteUrl(`/companies/${domain}/`),
      });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          return toolError(
            `No HireJack profile for "${domain}". The company may not be tracked, or the domain may be wrong (try the apex domain like 'stripe.com', not 'careers.stripe.com').`,
          );
        }
        return toolError(`HireJack API error (${err.status}): ${err.message}`);
      }
      return toolError(
        `Unexpected error: ${(err as Error).message ?? String(err)}`,
      );
    }
  },
};

// Every other public tool maps its upstream payload; this one used to pass
// the raw profile through. Drop internal fields (ATS platform is deliberately
// hidden from all public surfaces per site policy) and cap the long-tail
// arrays — topSkills alone is ~1.9KB of the ~8.5KB response.
function slimProfile(p: CompanyProfile) {
  const {
    atsType: _atsType,
    careerUrl: _careerUrl,
    ...rest
  } = p as Record<string, unknown>;
  const capped: Record<string, unknown> = { ...rest };
  for (const [key, cap] of [
    ["topSkills", 15],
    ["techStack", 15],
    ["topTitles", 10],
    ["topLocations", 10],
  ] as const) {
    if (Array.isArray(capped[key])) {
      capped[key] = (capped[key] as unknown[]).slice(0, cap);
    }
  }
  return capped;
}
