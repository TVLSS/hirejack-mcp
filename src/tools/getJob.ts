import { z } from "zod";
import { apiGet, siteUrl, ApiError } from "../lib/api.js";
import { toolResult, toolError } from "../lib/format.js";
import type { Tool } from "../registry.js";

// `get_job` is the pair to `search_jobs`: when the caller already knows which
// job (domain + jobId, or a HireJack detail URL), fetch the full record
// without making them search for it again.

const URL_PATTERN = /^https?:\/\/(?:www\.)?hirejack\.com\/jobs\/([^/]+)\/([^/?#]+)\/?/i;

const inputSchema = z
  .object({
    domain: z
      .string()
      .optional()
      .describe(
        "Company domain (e.g. 'stripe.com'). Required unless `url` is provided.",
      ),
    jobId: z
      .string()
      .optional()
      .describe(
        "Job canonical id — pass the `id` field from a `search_jobs` result " +
          "VERBATIM (it may contain '#' separators, e.g. " +
          "'greenhouse#stripe#4921361'; keep them). The dashed URL form also " +
          "works. Required unless `url` is provided.",
      ),
    url: z
      .string()
      .optional()
      .describe(
        "Full HireJack job detail URL, e.g. 'https://hirejack.com/jobs/stripe.com/sw-eng-12345/'. " +
          "Convenience alternative to passing `domain` + `jobId` separately.",
      ),
  })
  .refine((v) => v.url || (v.domain && v.jobId), {
    message: "Provide either `url` OR both `domain` and `jobId`.",
  });

type Args = z.infer<typeof inputSchema>;

type JobRecord = {
  canonicalId?: string;
  companyDomain?: string;
  companyName?: string;
  titleRaw?: string;
  standardizedTitle?: string;
  family?: string;
  seniority?: string;
  track?: string;
  locationRaw?: string;
  postalCode?: string;
  skillNames?: string[];
  postedAt?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  visaSponsorship?: string;
  remotePolicy?: string;
  education?: string;
  yearsMin?: number;
  apply_url?: string;
  url?: string;
  aiSummary?: string;
  gated?: boolean;
};

export const getJobTool: Tool = {
  name: "get_job",
  description:
    "Fetch one job posting by domain + jobId, or by HireJack detail URL. " +
    "Returns title, company, location, salary, skills, seniority, posted " +
    "date, visa/remote/education metadata, and (when available) the AI " +
    "summary. Use after `search_jobs` when the user picks a specific role " +
    "to discuss, or when the user pastes a HireJack job URL. Not for " +
    "browsing or filtering postings (`search_jobs`) or personal fit " +
    "scoring (`match_job`).",
  inputSchema,
  handler: async (args: Args) => {
    let domain = args.domain;
    let jobId = args.jobId;

    if (args.url) {
      const m = args.url.match(URL_PATTERN);
      if (!m) {
        return toolError(
          "URL must look like https://hirejack.com/jobs/{domain}/{jobId}/",
        );
      }
      domain = m[1];
      // URL form has '#' substituted to '-' for safety. The DDB lookup needs
      // the raw canonicalId. We don't know which '-' chars were originally
      // '#', so try the URL form first and fall back to translated form.
      jobId = m[2];
    }

    if (!domain || !jobId) {
      return toolError("Provide either `url` or both `domain` and `jobId`.");
    }

    const lookupVariants = [jobId];
    // If the input contains dashes, also try the form where dashes are '#',
    // which is the raw canonicalId shape used by ATS slugs like
    // "greenhouse#stripe#12345". Most modern canonicalIds use dashes natively,
    // so the original form is usually correct on the first try.
    if (jobId.includes("-") && !jobId.includes("#")) {
      lookupVariants.push(jobId.replace(/-/g, "#"));
    }

    let job: JobRecord | null = null;
    let lastError: ApiError | null = null;
    for (const variant of lookupVariants) {
      try {
        job = await apiGet<JobRecord>(
          `/companies/${encodeURIComponent(domain)}/jobs/${encodeURIComponent(variant)}`,
        );
        break;
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          lastError = e;
          continue;
        }
        throw e;
      }
    }

    try {
      if (!job) throw lastError || new ApiError(404, "Job not found");

      return toolResult({
        data: slim(job),
        citation_url: siteUrl(`/jobs/${domain}/${jobId.replace(/#/g, "-")}/`),
        meta: {
          // Surface when a Free-tier paywall would gate the full description
          // on the website (the slim payload here does NOT include the
          // descriptionHtml; the MCP tool intentionally returns metadata only
          // because raw HTML is rarely useful for LLM context).
          gated: job.gated || undefined,
        },
      });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          return toolError(
            `Job not found: ${domain}/${jobId}. Use \`search_jobs\` to find live postings.`,
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

function slim(j: JobRecord) {
  // Return raw canonicalId so round-trips to other tools work. URL form is
  // available via detail_url below.
  const id = j.canonicalId;
  const urlSafeId = j.canonicalId ? j.canonicalId.replace(/#/g, "-") : undefined;
  return {
    id,
    title: j.standardizedTitle || j.titleRaw,
    company: j.companyName,
    company_domain: j.companyDomain,
    family: j.family,
    seniority: j.seniority,
    track: j.track,
    location: j.locationRaw,
    salary:
      j.salaryMin || j.salaryMax
        ? {
            min: j.salaryMin,
            max: j.salaryMax,
            currency: j.salaryCurrency || "USD",
            period: "year",
          }
        : null,
    posted_at: j.postedAt,
    skills: (j.skillNames || []).slice(0, 20),
    visa_sponsorship: j.visaSponsorship,
    remote_policy: j.remotePolicy,
    education: j.education,
    years_min: j.yearsMin,
    apply_url: j.url || j.apply_url,
    ai_summary: j.aiSummary,
    detail_url:
      j.companyDomain && urlSafeId
        ? siteUrl(`/jobs/${j.companyDomain}/${urlSafeId}/`)
        : undefined,
  };
}
