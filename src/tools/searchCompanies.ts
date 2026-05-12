import { z } from "zod";
import { apiGet, siteUrl, ApiError } from "../lib/api.js";
import { toolResult, toolError } from "../lib/format.js";
import type { Tool } from "../registry.js";

const inputSchema = z.object({
  industry: z
    .string()
    .optional()
    .describe(
      "Industry substring filter (case-insensitive). Examples: 'fintech', 'health tech', 'gaming', 'defense', 'AI'.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("Max companies to return (default 50)"),
});

type Args = z.infer<typeof inputSchema>;

type CompanyListItem = {
  domain?: string;
  companyName?: string;
  industry?: string;
  atsType?: string;
  totalJobs?: number;
  engineeringJobs?: number;
  engineeringPct?: number;
};

type ListCompaniesResponse = {
  companies: CompanyListItem[];
  count: number;
  cursor?: string;
};

export const searchCompaniesTool: Tool = {
  name: "search_companies",
  description:
    "List HireJack's tracked companies with hiring volume. Filter by " +
    "industry. Returns slim records with domain, name, industry, total " +
    "open jobs, and engineering job count. Use this to find companies in " +
    "a sector ('which fintech companies are hiring?') or to discover " +
    "domain names before calling get_company_profile.",
  inputSchema,
  handler: async ({ industry, limit }: Args) => {
    try {
      const data = await apiGet<ListCompaniesResponse>("/companies", {
        industry,
        limit: limit ?? 50,
        slim: "1",
      });
      const companies = (data.companies || []).map((c) => ({
        domain: c.domain,
        name: c.companyName,
        industry: c.industry,
        ats: c.atsType,
        total_jobs: c.totalJobs,
        engineering_jobs: c.engineeringJobs,
        engineering_pct: c.engineeringPct,
        profile_url: c.domain ? siteUrl(`/companies/${c.domain}/`) : undefined,
      }));
      return toolResult({
        data: { companies, count: companies.length },
        citation_url: siteUrl("/companies.html"),
      });
    } catch (err) {
      if (err instanceof ApiError) {
        return toolError(`HireJack API error (${err.status}): ${err.message}`);
      }
      return toolError(
        `Unexpected error: ${(err as Error).message ?? String(err)}`,
      );
    }
  },
};
