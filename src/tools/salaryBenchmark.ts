import { z } from "zod";
import { apiGet, siteUrl } from "../lib/api.js";
import { handleApiError, proResult, requireUser } from "../lib/proAuth.js";
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

const inputSchema = z.object({
  family: z.enum(FAMILIES).optional().describe("Role family to benchmark against"),
  seniority: z.enum(SENIORITIES).optional().describe("Seniority level to benchmark against"),
  salary: z
    .number()
    .int()
    .optional()
    .describe(
      "User's current annual USD salary. When provided, the response includes " +
        "the user's percentile ranking within the slice.",
    ),
});

export const salaryBenchmarkTool: Tool = {
  name: "salary_benchmark",
  description:
    "Compare a salary against the live HireJack market for a role family + " +
    "seniority slice. Pro tier. Returns precomputed P10/P25/P50/P75/P90 " +
    "percentiles, the user's percentile ranking (when `salary` is supplied), " +
    "and a career-ladder progression of medians by seniority. Use for 'am I " +
    "paid well as a senior backend engineer?' or 'what should I ask for?'.",
  inputSchema,
  handler: async (args, ctx) => {
    const deps = {
      ctx,
      citationUrl: siteUrl(args.family ? `/salaries/${args.family}/` : "/salaries.html"),
      toolLabel: "salary_benchmark",
    };
    const auth = requireUser(deps);
    if ("error" in auth) return auth.error;
    try {
      const data = await apiGet("/salary/benchmark", args, { authToken: auth.token });
      return proResult(data, deps.citationUrl);
    } catch (e) {
      return handleApiError(e, deps);
    }
  },
};
