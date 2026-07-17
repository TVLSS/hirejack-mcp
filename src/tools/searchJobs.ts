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
      "Free-text keyword search (case-insensitive substring) across raw and " +
        "standardized title, company name, company domain, and location. " +
        "Tip: use the `skill` parameter for skill matches — `q` does NOT " +
        "search job descriptions or the skill list.",
    ),
  family: z
    .enum(FAMILIES)
    .optional()
    .describe(
      "Role family (software_engineering, machine_learning, etc.). Omit to " +
        "search all families.",
    ),
  seniority: z
    .enum(SENIORITIES)
    .optional()
    .describe(
      "Seniority level on the intern → vp ladder. Omit to include all levels.",
    ),
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
  remote: z
    .enum(REMOTE_MODES)
    .optional()
    .describe(
      "Remote policy filter; 'remote+hybrid' matches either mode. Omit to " +
        "include onsite jobs too.",
    ),
  posted_since: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")
    .optional()
    .describe(
      "Only include jobs posted on or after this date (YYYY-MM-DD). " +
        "E.g. for 'jobs posted this week', pass the date 7 days ago.",
    ),
  salary_min: z.coerce
    .number()
    .int()
    .optional()
    .describe(
      "Minimum salary floor (annual USD). Matches jobs whose disclosed " +
        "salary range *could pay at least* this much (i.e. salaryMax >= X). " +
        "A job with range $150K–$250K matches salary_min=200000.",
    ),
  salary_max: z.coerce
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
    .describe(
      "Set true to only include jobs with a disclosed salary range; omit " +
        "to include jobs without pay data.",
    ),
  visa: z
    .enum(VISA_VALUES)
    .optional()
    .describe(
      "Visa sponsorship (AI-extracted): 'yes' returns jobs whose posting " +
        "indicates sponsorship, 'no' those that rule it out. Omit to include " +
        "jobs where the posting doesn't say.",
    ),
  education: z
    .enum(["none", "associate", "bachelor", "master", "phd"])
    .optional()
    .describe(
      "Minimum degree the job requires (AI-extracted). E.g. 'bachelor' " +
        "returns jobs whose stated requirement is exactly a bachelor's.",
    ),
  experience: z
    .enum(["0-2", "3-5", "5-10", "10+"])
    .optional()
    .describe(
      "Years-of-experience bucket the job asks for (AI-extracted yearsMin). " +
        "E.g. '0-2' for entry-level-friendly roles, '10+' for very senior ones.",
    ),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Max results to return (default 25, max 100)"),
  cursor: z
    .string()
    .optional()
    .describe(
      "Opaque pagination cursor from a previous search_jobs call's " +
        "`meta.next_cursor`. Pass it back (with the SAME filters) to fetch " +
        "the next page of results.",
    ),
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
  education?: string;
  yearsMin?: number;
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
    "developers in NYC'. Not for a single known posting (`get_job`), " +
    "company-level questions (`get_company_profile`), personalized ranking " +
    "(`recommendations`), or aggregate market stats (`get_market_pulse`).",
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
        education: args.education,
        experience: args.experience,
        postedSince: args.posted_since,
        cursor: args.cursor,
        limit,
      });

      const jobs = (data.jobs || []).slice(0, limit).map(slimJob);

      return toolResult({
        data: { jobs, count: jobs.length },
        citation_url: siteUrl("/jobs.html"),
        meta: {
          filters: stripUndefined(args),
          next_cursor: data.cursor,
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
  // `id` is the raw canonicalId — pass it straight back to `get_job` or any
  // other tool that needs to identify the job. URL construction (`detail_url`
  // below) handles the URL-safe substitution separately so we don't lose
  // round-trip identity at the MCP boundary.
  const id = j.canonicalId;
  const urlSafeId = j.canonicalId ? safeId(j.canonicalId) : undefined;
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
    education: j.education,
    years_min: j.yearsMin,
    apply_url: j.url,
    detail_url:
      j.companyDomain && urlSafeId
        ? siteUrl(`/jobs/${j.companyDomain}/${urlSafeId}/`)
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
