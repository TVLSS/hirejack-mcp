import { z } from "zod";
import { apiGet, apiPut, siteUrl } from "../lib/api.js";
import { envelopeSchema, toolError } from "../lib/format.js";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import type { Tool } from "../registry.js";

// Profile read + preference writes. Without get_profile, every conversation
// about "my matches" starts blind — the agent can't explain WHY the
// recommendations look the way they do (e.g. a $130K minimum-salary floor is
// silently hiding most of the corpus). update_preferences closes the loop:
// "raise my minimum to $150K" persists to the same profile the website,
// For You feed, digest, and alerts all read.

type MeResponse = {
  user?: {
    name?: string;
    headline?: string;
    tier?: string;
    tierExpiresAt?: string;
    skills?: string[];
    desiredRoles?: string[];
    seniorityPreference?: string;
    locationCity?: string;
    remotePreference?: string;
    countryPreference?: string;
    minSalary?: number;
    requireSalary?: boolean;
    yearsExperience?: number;
    onboardingComplete?: boolean;
  };
};

function slimProfile(u: NonNullable<MeResponse["user"]>) {
  return {
    name: u.name || null,
    headline: u.headline || null,
    tier: u.tier || "free",
    ...(u.tierExpiresAt ? { tier_expires_at: u.tierExpiresAt.slice(0, 10) } : {}),
    skills: u.skills || [],
    desired_roles: u.desiredRoles || [],
    ...(typeof u.yearsExperience === "number" ? { years_experience: u.yearsExperience } : {}),
    onboarding_complete: u.onboardingComplete === true,
    // The preference block below HARD-filters For You, recommendations,
    // digest, and alerts — surface it so the agent can explain match results.
    preferences: {
      seniority: u.seniorityPreference || null,
      location_city: u.locationCity || null,
      remote: u.remotePreference || "any",
      country: u.countryPreference || "any",
      min_salary_usd: typeof u.minSalary === "number" && u.minSalary > 0 ? u.minSalary : null,
      require_salary_usd: u.requireSalary === true,
    },
  };
}

const profileSchema = z
  .object({
    name: z.string().nullable().optional(),
    headline: z.string().nullable().optional(),
    tier: z.string().optional().describe("'free' | 'pro' | 'premium' | 'analyst' | recruiter tiers"),
    tier_expires_at: z.string().optional().describe("YYYY-MM-DD; absent for non-expiring tiers"),
    skills: z.array(z.string()).optional().describe("Skill ids from codex/skills.json"),
    desired_roles: z.array(z.string()).optional().describe("Canonical taxonomy titleIds"),
    years_experience: z.number().optional().describe("Resume-derived years of experience, when known"),
    onboarding_complete: z.boolean().optional(),
    preferences: z
      .object({
        seniority: z.string().nullable().optional().describe("junior|mid|senior|staff|management, or null"),
        location_city: z.string().nullable().optional(),
        remote: z.string().optional().describe("'remote' | 'remote-us' | 'hybrid' | 'onsite' | 'any' — remote/remote-us HARD-filter matches"),
        country: z.string().optional().describe("'US' hard-filters matches to US-available jobs; 'any' = no filter"),
        min_salary_usd: z.number().nullable().optional().describe("Annual USD floor a match's listed range must clear; null = no minimum"),
        require_salary_usd: z.boolean().optional().describe("When true, jobs without a listed USD salary can't match"),
      })
      .passthrough()
      .optional()
      .describe("These HARD-filter For You, recommendations, digest, and alerts"),
  })
  .passthrough();

export const getProfileTool: Tool = {
  name: "get_profile",
  description:
    "Get the authenticated user's HireJack profile: skills, desired roles, " +
    "tier, and the matching preferences (seniority, city, remote, US-only, " +
    "minimum salary) that hard-filter their recommendations, For You feed, " +
    "and email alerts. Call this before explaining match results or " +
    "recommendations — a minimum-salary floor or remote-only preference " +
    "changes what the user sees. Not for changing preferences — use the " +
    "companion write tool `update_preferences` for that.",
  inputSchema: z.object({}),
  outputSchema: envelopeSchema(profileSchema, "The authenticated user's profile and matching preferences"),
  annotations: { readOnlyHint: true, idempotentHint: true },
  handler: async (_args, ctx) => {
    const citationUrl = siteUrl("/settings.html");
    const deps = { ctx, citationUrl, toolLabel: "get_profile", anyTier: true };
    const auth = requireUser(deps);
    if ("error" in auth) return auth.error;
    try {
      const me = await apiGet<MeResponse>("/auth/me", {}, { authToken: auth.token });
      if (!me.user) return toolError("get_profile: profile not found.");
      return proResult(slimProfile(me.user), citationUrl);
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};

const REMOTE_PREFS = ["remote", "remote-us", "hybrid", "onsite", "any"] as const;
const COUNTRY_PREFS = ["any", "US"] as const;
const SENIORITY_PREFS = ["junior", "mid", "senior", "staff", "management"] as const;

const updateSchema = z
  .object({
    min_salary_usd: z.coerce
      .number()
      .int()
      .min(0)
      .max(5_000_000)
      .optional()
      .describe(
        "Minimum annual salary in USD. Matches must pay at least this — the " +
          "bottom of a job's listed range must clear it. Pass 0 to remove " +
          "the minimum. Jobs without listed pay still match unless " +
          "require_salary_usd is true.",
      ),
    require_salary_usd: z
      .boolean()
      .optional()
      .describe(
        "When true, only jobs with a listed USD salary can match (strict " +
          "mode for the minimum-salary filter). Default false.",
      ),
    remote_preference: z
      .enum(REMOTE_PREFS)
      .optional()
      .describe(
        "'remote' and 'remote-us' HARD-filter matches to remote (US-remote) " +
          "jobs; 'hybrid'/'onsite' only boost scoring; 'any' clears.",
      ),
    country_preference: z
      .enum(COUNTRY_PREFS)
      .optional()
      .describe("'US' hard-filters matches to US-available jobs; 'any' clears."),
    seniority_preference: z
      .enum(SENIORITY_PREFS)
      .optional()
      .describe("Target seniority level, used in match scoring."),
    location_city: z
      .string()
      .max(80)
      .optional()
      .describe("Preferred city, e.g. 'San Francisco, CA'. Empty string clears."),
  })
  .refine((o) => Object.values(o).some((v) => v !== undefined), {
    message: "Provide at least one preference to update.",
  });

type UpdateArgs = z.infer<typeof updateSchema>;

export const updatePreferencesTool: Tool = {
  name: "update_preferences",
  description:
    "Update the authenticated user's HireJack matching preferences: minimum " +
    "salary (USD), require-listed-salary strict mode, remote preference, " +
    "US-only, target seniority, preferred city. Changes persist to the " +
    "user's profile and immediately re-filter their For You feed, " +
    "recommendations, weekly digest, and daily job alerts — same effect as " +
    "editing Settings on the website. Returns the full updated preference " +
    "set. Use for 'raise my minimum salary to $150K', 'only show me remote " +
    "US jobs', 'set my target level to staff'. Not for reading current " +
    "settings — use `get_profile` for that.",
  inputSchema: updateSchema,
  outputSchema: envelopeSchema(
    z
      .object({
        updated: z.boolean().optional(),
        profile: profileSchema.nullable().optional().describe("The full profile after the update (same shape as get_profile)"),
      })
      .passthrough(),
    "Confirmation plus the updated profile",
  ),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async (args: UpdateArgs, ctx) => {
    const citationUrl = siteUrl("/settings.html");
    const deps = { ctx, citationUrl, toolLabel: "update_preferences", anyTier: true };
    const auth = requireUser(deps);
    if ("error" in auth) return auth.error;

    const body: Record<string, unknown> = {};
    if (args.min_salary_usd !== undefined) body.minSalary = args.min_salary_usd; // server stores 0 as null
    if (args.require_salary_usd !== undefined) body.requireSalary = args.require_salary_usd;
    if (args.remote_preference !== undefined) body.remotePreference = args.remote_preference;
    if (args.country_preference !== undefined) body.countryPreference = args.country_preference;
    if (args.seniority_preference !== undefined) body.seniorityPreference = args.seniority_preference;
    if (args.location_city !== undefined) body.locationCity = args.location_city.trim();

    try {
      const resp = await apiPut<MeResponse>("/profile", body, { authToken: auth.token });
      const updated = resp.user ? slimProfile(resp.user) : null;
      return proResult(
        updated ? { updated: true, profile: updated } : { updated: true },
        citationUrl,
        { note: "Preferences apply immediately to For You, recommendations, digest, and alerts." },
      );
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};
