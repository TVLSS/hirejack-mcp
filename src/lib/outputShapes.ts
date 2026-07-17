// Shared output-shape schemas for tools that declare an outputSchema.
// DELIBERATELY PERMISSIVE: every field optional, every object .passthrough().
// The published contract documents what agents can rely on; additive payload
// changes must never violate it. Keep field docs in sync with the slim()
// mappers in the tool files.
import { z } from "zod";

export const salarySchema = z
  .object({
    min: z.number().optional().describe("Bottom of the disclosed range (annual)"),
    max: z.number().optional().describe("Top of the disclosed range (annual)"),
    currency: z.string().optional().describe("Currency code, e.g. 'USD'"),
    period: z.string().optional().describe("Pay period, normally 'year'"),
  })
  .passthrough()
  .nullable()
  .describe("Disclosed pay range, or null when the posting lists none");

export const jobSlimSchema = z
  .object({
    id: z.string().optional().describe("Raw canonical job id — pass back to get_job, match_job, save_job, or track_application"),
    title: z.string().optional().describe("Standardized title when available, else the raw posting title"),
    company: z.string().optional(),
    company_domain: z.string().optional().describe("e.g. 'stripe.com' — pass to get_company_profile or company_fit"),
    family: z.string().optional().describe("Role family, e.g. 'software_engineering'"),
    seniority: z.string().optional().describe("intern|junior|mid|senior|staff|principal|manager|director|vp"),
    track: z.string().optional().describe("ic|tech_leadership|hybrid|management (get_job only)"),
    location: z.string().optional().describe("Normalized location, e.g. 'San Francisco, CA' or 'Remote (US)'"),
    salary: salarySchema.optional(),
    posted_at: z.string().optional().describe("YYYY-MM-DD"),
    skills: z.array(z.string()).optional().describe("Extracted skill names (capped)"),
    visa_sponsorship: z.string().nullable().optional().describe("'yes' | 'no' | null — AI-extracted from the posting"),
    remote_policy: z.string().nullable().optional().describe("'remote' | 'hybrid' | 'onsite' | null — AI-extracted"),
    education: z.string().nullable().optional().describe("Stated degree requirement, e.g. 'bachelor', or null"),
    years_min: z.number().nullable().optional().describe("Minimum years of experience the posting asks for, or null"),
    apply_url: z.string().optional().describe("Direct ATS application URL"),
    ai_summary: z.string().optional().describe("2-3 sentence AI summary when available (get_job only)"),
    detail_url: z.string().optional().describe("hirejack.com job page for citation"),
  })
  .passthrough();

export const companySlimSchema = z
  .object({
    domain: z.string().optional().describe("Company domain — pass to get_company_profile / company_fit / watch_company"),
    name: z.string().optional(),
    industry: z.string().optional(),
    total_jobs: z.number().optional().describe("Total open postings tracked"),
    engineering_jobs: z.number().optional(),
    engineering_pct: z.number().optional().describe("Engineering share of open roles, 0-100"),
    profile_url: z.string().optional().describe("hirejack.com company page for citation"),
  })
  .passthrough();

export const companyProfileSchema = z
  .object({
    companyName: z.string().optional(),
    domain: z.string().optional(),
    industry: z.string().optional(),
    totalJobs: z.number().optional().describe("Total open postings"),
    engineeringJobs: z.number().optional(),
    engineeringPct: z.number().optional(),
    medianSalary: z.number().nullable().optional().describe("Median of disclosed salaries (annual USD), when enough postings disclose pay"),
    jobsWithCompensation: z.number().optional(),
    hiringTrend: z.string().optional().describe("'up' | 'down' | 'stable' (2-month rolling average)"),
    trendPct: z.number().optional().describe("Trend magnitude, % change"),
    topSkills: z.array(z.object({}).passthrough()).optional().describe("Top skills with adoption counts (capped at 15)"),
    techStack: z.array(z.object({}).passthrough()).optional().describe("Capped at 15"),
    topTitles: z.array(z.object({}).passthrough()).optional().describe("Capped at 10"),
    topLocations: z.array(z.object({}).passthrough()).optional().describe("Capped at 10"),
    seniorityDistribution: z.array(z.object({}).passthrough()).optional(),
    familyDistribution: z.array(z.object({}).passthrough()).optional(),
    content: z.string().optional().describe("AI-generated analyst hiring brief"),
  })
  .passthrough()
  .describe("Full hiring profile for one company; additional aggregate fields may be present");

export const marketPulseSchema = z
  .object({})
  .passthrough()
  .describe(
    "Market-wide snapshot: job/company totals, remote share, top skills by " +
      "demand, top companies by hiring volume, and week-over-week trending " +
      "skills. Field set mirrors hirejack.com/market/ and may gain fields; " +
      "the text content carries the identical JSON.",
  );
