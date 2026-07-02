// Shared job-reference handling for tools that target one job (match_job,
// resume_rewrite, interview_prep). Mirrors get_job's conveniences so callers
// can pass either domain+jobId or a pasted HireJack URL, and so lookups
// tolerate both id forms (raw canonicalId with '#' vs the URL-safe dashed
// form used in detail-page paths).

import { apiGet, siteUrl, ApiError } from "./api.js";

export const JOB_URL_PATTERN =
  /^https?:\/\/(?:www\.)?hirejack\.com\/jobs\/([^/]+)\/([^/?#]+)\/?/i;

/** The static job pages live at /jobs/{domain}/{canonicalId-with-#-replaced
 *  -by-dashes}/ because '#' is the URL fragment delimiter. */
export function safeId(canonicalId: string): string {
  return canonicalId.replace(/#/g, "-");
}

export type JobRef = { domain: string; jobId: string };

/** Resolve {domain, jobId} from either explicit fields or a HireJack URL.
 *  Returns an error string when neither form is usable. */
export function resolveJobRef(args: {
  domain?: string;
  jobId?: string;
  url?: string;
}): JobRef | { error: string } {
  if (args.url) {
    const m = args.url.match(JOB_URL_PATTERN);
    if (!m) {
      return {
        error: "URL must look like https://hirejack.com/jobs/{domain}/{jobId}/",
      };
    }
    return { domain: m[1], jobId: m[2] };
  }
  if (args.domain && args.jobId) {
    return { domain: args.domain, jobId: args.jobId };
  }
  return { error: "Provide either `url` OR both `domain` and `jobId`." };
}

/** Lookup variants for a jobId: the given form first, then the dashes→'#'
 *  translation (URL-safe form back to raw canonicalId). Same fallback
 *  get_job uses — most ids are correct on the first try. */
export function jobIdVariants(jobId: string): string[] {
  const variants = [jobId];
  if (jobId.includes("-") && !jobId.includes("#")) {
    variants.push(jobId.replace(/-/g, "#"));
  }
  return variants;
}

/** Citation URL for a job — always the URL-safe form so the link works. */
export function jobCitationUrl(domain: string, jobId: string): string {
  return siteUrl(`/jobs/${domain}/${safeId(jobId)}/`);
}

/** Authenticated GET that retries across jobId variants on 404. Used by the
 *  Pro/Premium per-job tools so a URL-safe (dashed) id still resolves. */
export async function apiGetJobVariants(
  path: string,
  domain: string,
  jobId: string,
  token: string,
): Promise<unknown> {
  let lastErr: unknown;
  for (const variant of jobIdVariants(jobId)) {
    try {
      return await apiGet(path, { domain, jobId: variant }, { authToken: token });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        lastErr = e;
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}
