import { z } from "zod";
import { apiGet, siteUrl } from "../lib/api.js";
import { envelopeSchema } from "../lib/format.js";
import { companyCurrentStateSchema, companyMonthlySnapshotSchema } from "../lib/outputShapes.js";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
import type { Tool } from "../registry.js";

const inputSchema = z.object({
  domains: z
    .array(z.string().min(1))
    .min(1)
    .max(5)
    .describe(
      "Up to 5 company domains to compare side-by-side (e.g. " +
        "['stripe.com', 'plaid.com', 'adyen.com'])",
    ),
  months: z.coerce
    .number()
    .int()
    .min(1)
    .max(12)
    .optional()
    .describe(
      "Months of monthly-snapshot history per company (1-12, default 6). " +
        "Snapshots began March 2026, so depth is capped by available history.",
    ),
});

export const compareCompaniesTool: Tool = {
  name: "compare_companies",
  description:
    "Compare hiring profiles of multiple companies side-by-side. " + "Analyst tier." + " " +
    "tier. Returns per-company current state (totalJobs, medianSalary, " +
    "trend, top skills) plus monthly snapshot history for the chosen " +
    "window. Up to 5 companies. Use for 'compare hiring at Stripe vs " +
    "Plaid vs Adyen' or 'which of these is growing fastest?'. Not for one " +
    "company in depth (`get_company_profile`) or the user's personal fit " +
    "(`company_fit`).",
  inputSchema,
  outputSchema: envelopeSchema(
    z
      .object({
        months: z.number().optional().describe("Snapshot window requested"),
        companies: z
          .array(
            z
              .object({
                domain: z.string().optional().describe("Pass to get_company_profile / get_company_history"),
                companyName: z.string().optional(),
                industry: z.string().optional(),
                current: companyCurrentStateSchema.optional(),
                topSkills: z.array(z.object({}).passthrough()).optional().describe("Capped at 5"),
                snapshots: z.array(companyMonthlySnapshotSchema).optional().describe("Monthly snapshots (slim subset), oldest first"),
              })
              .passthrough(),
          )
          .optional()
          .describe("One entry per requested domain, in request order"),
      })
      .passthrough(),
    "Side-by-side hiring comparison of up to 5 companies",
  ),
  handler: async (args, ctx) => {
    const deps = {
      ctx,
      citationUrl: siteUrl(`/compare?d=${args.domains.join(",")}`),
      toolLabel: "compare_companies",
      analyst: true,
    };
    const auth = requireUser(deps);
    if ("error" in auth) return auth.error;
    try {
      const data = await apiGet(
        "/analyst/compare",
        { domains: args.domains.join(","), months: args.months },
        { authToken: auth.token },
      );
      return proResult(data, deps.citationUrl);
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};
