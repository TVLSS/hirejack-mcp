import { z } from "zod";
import { apiGet, siteUrl, ApiError } from "../lib/api.js";
import { toolResult, toolError } from "../lib/format.js";
import type { Tool } from "../registry.js";

const FAMILIES = [
  "software_engineering",
  "data_engineering",
  "machine_learning",
  "security",
  "product",
  "design",
  "operations",
  "marketing",
  "sales",
  "finance",
  "people",
  "services",
  "legal",
  "other",
] as const;

const SENIORITIES = [
  "intern",
  "junior",
  "mid",
  "senior",
  "staff",
  "principal",
  "manager",
  "director",
  "vp",
] as const;

const REMOTE_MODES = ["remote", "hybrid", "remote+hybrid"] as const;
const VISA_VALUES = ["yes", "no"] as const;

const inputSchema = z.object({
  q: z
    .string()
    .optional()
    .describe(
      "Free-text keyword search (case-sensitive substring) across raw and " +
        "standardized title, company name, company domain, and location. " +
        "Tip: use the `skill` parameter for skill matches — `q` does NOT " +
        "search job descriptions or the skill list.",
    ),
  family: z
    .enum(FAMILIES)
    .optional()
    .describe("Role family (software_engineering, machine_learning, etc.)"),
  seniority: z.enum(SENIORITIES).optional().describe("Seniority level"),
  skill: z
    .string()
    .optional()
    .describe(
      "Single skill name to require (case-insensitive substring match), e.g. 'Rust' or 'Kubernetes'",
    ),
  company: z
    .string()
    .optional()
    .describe("Company domain to filter by, e.g. 'stripe.com'"),
  location: z
    .string()
    .optional()
    .describe(
      "Location substring filter, e.g. 'San Francisco' or 'New York'",
    ),
  remote: z.enum(REMOTE_MODES).optional().describe("Remote policy filter"),
  salary_min: z
    .number()
    .int()
    .optional()
    .describe(
      "Minimum salary floor (annual USD). Matches jobs whose disclosed " +
        "salary range *could pay at least* this much (i.e. salaryMax >= X). " +
        "A job with range $150K–$250K matches salary_min=200000.",
    ),
  salary_max: z
    .number()
    .int()
    .optional()
    .describe(
      "Maximum salary ceiling (annual USD). Matches jobs whose floor is " +
        "at or below this (i.e. salaryMin <= X).",
    ),
  has_salary: z
    .boolean()
    .optional()
    .describe("Only include jobs with disclosed salary"),
  visa: z
    .enum(VISA_VALUES)
    .optional()
    .describe("Visa sponsorship: 'yes' or 'no'"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Max results to return (default 25, max 100)"),
});

type Args = z.infer<typeof inputSchema>;

type JobItem = {
  canonicalId?: string;
  companyDomain?: string;
  companyName?: string;
  titleRaw?: string;
  standardizedTitle?: string;
  family?: string;
  seniority?: string;
  locationRaw?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: string;
  postedAt?: string;
  url?: string;
  skillNames?: string[];
  visaSponsorship?: string;
  remotePolicy?: string;
};

type ListJobsResponse = {
  jobs: JobItem[];
  count: number;
  cursor?: string;
};

export const searchJobsTool: Tool = {
  name: "search_jobs",
  description:
    "Search HireJack's database of live tech job postings. Filter by " +
    "keyword, role family, seniority, skill, location, salary, remote " +
    "policy, or visa sponsorship. Returns a slim list of jobs with title, " +
    "company, location, salary range, posted date, and key skills. Use " +
    "this for queries like 'remote senior backend roles paying $200K+', " +
    "'data engineer jobs at fintech companies', 'who is hiring Rust " +
    "developers in NYC'.",
  inputSchema,
  handler: async (args: Args) => {
    try {
      const limit = args.limit ?? 25;
      const data = await apiGet<ListJobsResponse>("/jobs", {
        q: args.q,
        family: args.family,
        seniority: args.seniority,
        skill: args.skill,
        company: args.company,
        location: args.location,
        remote: args.remote,
        salaryMin: args.salary_min,
        salaryMax: args.salary_max,
        hasSalary: args.has_salary ? "1" : undefined,
        visa: args.visa,
        limit,
      });

      const jobs = (data.jobs || []).slice(0, limit).map(slimJob);

      return toolResult({
        data: { jobs, count: jobs.length },
        citation_url: siteUrl("/jobs.html"),
        meta: {
          filters: stripUndefined(args),
          note: jobs.length === 0 ? buildEmptyNote(args) : undefined,
        },
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

function slimJob(j: JobItem) {
  // Use the URL-safe form for `id` so callers that construct links from id +
  // company_domain (instead of using detail_url verbatim) also produce valid
  // URLs. The raw canonicalId contains '#' chars which break URL paths.
  const id = j.canonicalId ? safeId(j.canonicalId) : undefined;
  return {
    id,
    title: j.standardizedTitle || j.titleRaw,
    company: j.companyName,
    company_domain: j.companyDomain,
    family: j.family,
    seniority: j.seniority,
    location: j.locationRaw,
    salary:
      j.salaryMin || j.salaryMax
        ? {
            min: j.salaryMin,
            max: j.salaryMax,
            currency: j.salaryCurrency || "USD",
            period: j.salaryPeriod || "year",
          }
        : null,
    posted_at: j.postedAt,
    skills: (j.skillNames || []).slice(0, 12),
    visa_sponsorship: j.visaSponsorship,
    remote_policy: j.remotePolicy,
    apply_url: j.url,
    detail_url:
      j.companyDomain && id
        ? siteUrl(`/jobs/${j.companyDomain}/${id}/`)
        : undefined,
  };
}

function buildEmptyNote(args: Args): string {
  const tighten: string[] = [];
  if (args.salary_min) tighten.push("lower salary_min");
  if (args.salary_max) tighten.push("raise salary_max");
  if (args.visa) tighten.push("drop visa");
  if (args.remote) tighten.push("broaden remote");
  if (args.skill) tighten.push("widen skill");
  if (args.location) tighten.push("widen location");
  if (args.seniority) tighten.push("drop seniority");
  if (args.family) tighten.push("drop family");
  if (args.q) tighten.push("simplify q");
  if (tighten.length === 0) return "No matches.";
  return `No matches. Try: ${tighten.slice(0, 3).join(", ")}.`;
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

// Mirror prerender.js's safeId(): the static job pages live at
// /jobs/{domain}/{canonicalId-with-#-replaced-by-dashes}/ because '#' is
// the URL fragment delimiter and would otherwise break the link.
function safeId(canonicalId: string): string {
  return canonicalId.replace(/#/g, "-");
}
