import { z } from "zod";
import { apiGet, siteUrl, ApiError } from "../lib/api.js";
import { toolResult, toolError } from "../lib/format.js";
import type { Tool } from "../registry.js";

const inputSchema = z.object({
  q: z
    .string()
    .optional()
    .describe(
      "Company name or domain substring (case-insensitive). Use this to " +
        "resolve a company name to its domain, e.g. q='stripe' → " +
        "'stripe.com'. Combines with `industry` (AND).",
    ),
  industry: z
    .string()
    .optional()
    .describe(
      "Industry substring filter (case-insensitive). Examples: 'fintech', 'health tech', 'gaming', 'defense', 'AI'.",
    ),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("Max companies to return (1-200, default 50)"),
});

type Args = z.infer<typeof inputSchema>;

type CompanyListItem = {
  domain?: string;
  companyName?: string;
  industry?: string;
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
    "List HireJack's tracked companies with hiring volume. Filter by name/" +
    "domain (`q`) or industry. Returns slim records with domain, name, " +
    "industry, total open jobs, and engineering job count. Use this to " +
    "find companies in a sector ('which fintech companies are hiring?') or " +
    "to resolve a company name to its domain before calling " +
    "get_company_profile. Not for deep per-company data " +
    "(`get_company_profile`) or multi-axis segmentation by trend/skill/" +
    "job-count (`find_companies`, Analyst).",
  inputSchema,
  handler: async ({ q, industry, limit }: Args) => {
    try {
      const cap = Math.min(limit ?? 50, 200);
      // The `q` name/domain match is applied client-side, so fetch the full
      // directory when a needle is present and trim after filtering.
      const data = await apiGet<ListCompaniesResponse>("/companies", {
        industry,
        limit: q ? 200 : cap,
        slim: "1",
      });
      const needle = q ? q.toLowerCase() : null;
      const matched = (data.companies || []).filter(
        (c) =>
          !needle ||
          (c.companyName || "").toLowerCase().includes(needle) ||
          (c.domain || "").toLowerCase().includes(needle),
      );
      const companies = matched.slice(0, cap).map((c) => ({
        domain: c.domain,
        name: c.companyName,
        industry: c.industry,
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
