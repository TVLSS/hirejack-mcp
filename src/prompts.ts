// MCP prompts. Clients (Claude Desktop, Cursor, claude.ai) surface these as
// slash commands or quick actions in their UI. Each prompt resolves to one or
// more user-role messages the host LLM then runs against the available tools.
//
// Spec: https://modelcontextprotocol.io/specification/2025-06-18/server/prompts
//
// IMPORTANT — these are deliberately NOT the same prompts the hosted endpoint
// serves. This package is the stdio transport, which has no auth context at
// all (see lib/proAuth.ts: ctx.userId is always absent, and there is no token
// env var). Every Pro/Premium/Analyst/account tool therefore returns an
// "authenticate at the hosted endpoint" error here.
//
// A prompt is a slash command: a user clicks it and expects it to work. The
// hosted set is built around recommendations/match_job/skill_gap/company_fit,
// so ported verbatim, "career check-in" would fire four tools in a row and
// return four auth errors — strictly worse than offering no prompt. So the
// prompts below are built ONLY on the five tools that work without an account:
// search_jobs, get_job, get_company_profile, search_companies, get_market_pulse.
//
// Where a personalized answer genuinely needs an account, the prompt says so
// once, at the end, instead of walking the model into a failing tool call.

export type PromptArgument = {
  name: string;
  description: string;
  required?: boolean;
};

export type PromptDefinition = {
  name: string;
  description: string;
  arguments?: PromptArgument[];
  /** Build the user-role message text from the supplied arguments. */
  buildText: (args: Record<string, string>) => string;
};

// One shared footer, so the upgrade path is stated consistently and only once
// per prompt rather than nagging between every step.
const HOSTED_NOTE =
  "If I want this scored against my own profile (match %, skill gaps, " +
  "company fit), tell me once at the end that personalized scoring needs a " +
  "HireJack account via the hosted MCP endpoint — don't call those tools now, " +
  "they can't authenticate from this package.";

export const PROMPTS: PromptDefinition[] = [
  {
    name: "find_jobs",
    description:
      "Search live tech job postings by role, skill, location, pay and remote " +
      "policy — with a free-form constraint (e.g. 'remote, $200K+, Rust, no crypto').",
    arguments: [
      {
        name: "constraint",
        description:
          "What you're looking for: role, skills, location, salary floor, remote policy, company type.",
        required: true,
      },
    ],
    buildText: (args) =>
      [
        `Find live tech jobs matching: ${args.constraint}`,
        "",
        "1. Read the `hirejack://vocabulary/skills` resource first if you need",
        "   an exact skill name — `search_jobs.skill` matches those spellings,",
        "   so 'K8s' finds nothing where 'Kubernetes' works.",
        "2. Call `search_jobs` with the constraints mapped onto its filters",
        "   (skill, location, seniority, remote, salary_min, has_salary,",
        "   posted_since). Use `sort='salary'` if I asked for the best paid.",
        "3. If the result is thin, loosen ONE filter at a time and say which.",
        "4. Call `get_job` on the 2-3 strongest matches for the full posting.",
        "",
        "Return a short ranked list: title, company, location, salary, why it",
        "fits, and the apply URL. Link each with its citation_url.",
        "",
        HOSTED_NOTE,
      ].join("\n"),
  },
  {
    name: "company_deep_dive",
    description:
      "Everything HireJack knows about a company: who they're hiring, what " +
      "skills they want, salary bands, and hiring momentum.",
    arguments: [
      {
        name: "company",
        description:
          "Company domain (preferred, e.g. 'stripe.com') or name. If a name, resolve it to a domain via `search_companies` first.",
        required: true,
      },
    ],
    buildText: (args) =>
      [
        `Give me a deep-dive on ${args.company} using HireJack.`,
        "",
        "1. If I gave you a name rather than a domain, use `search_companies`",
        "   to resolve it.",
        "2. Use `get_company_profile` for the full hiring profile — tech stack,",
        "   role mix, seniority split, salary bands, hiring trend.",
        "3. Use `search_jobs` with `company` set to that domain to show what is",
        "   open right now; `sort='salary'` surfaces the top of their range.",
        "",
        "Output: a one-paragraph TL;DR, then tech stack, who they're hiring,",
        "salary bands, and momentum (growing / stable / shrinking). Link with",
        "the citation_url each tool returns.",
        "",
        HOSTED_NOTE,
      ].join("\n"),
  },
  {
    name: "market_snapshot",
    description:
      "What the tech hiring market is doing right now: volume, in-demand " +
      "skills, remote split, and pay — optionally narrowed to one role or skill.",
    arguments: [
      {
        name: "focus",
        description:
          "Optional: narrow to a role family, skill or location (e.g. 'machine learning', 'Rust', 'Austin').",
        required: false,
      },
    ],
    buildText: (args) => {
      const focus = (args.focus || "").trim();
      return [
        focus
          ? `Give me a snapshot of the tech hiring market for: ${focus}`
          : "Give me a snapshot of the tech hiring market right now.",
        "",
        "1. Call `get_market_pulse` for the aggregate picture — total open",
        "   roles, top skills, remote split, compensation bands.",
        focus
          ? "2. Call `search_jobs` narrowed to that focus to see what the demand" +
            "\n   actually looks like, and again with `has_salary=true` and" +
            "\n   `sort='salary'` to see the top of the range."
          : "2. Call `search_jobs` with `has_salary=true` and `sort='salary'` to" +
            "\n   show where the top of the market is paying.",
        "3. Use `posted_since` (7 days ago) to separate what's fresh from the",
        "   standing backlog.",
        "",
        "Give me the numbers first, then two or three sentences on what they",
        "mean for someone job-hunting. Note that HireJack refreshes daily, so",
        "'live' means within the last 24 hours.",
      ]
        .filter(Boolean)
        .join("\n");
    },
  },
  {
    name: "salary_landscape",
    description:
      "What a role or skill actually pays across companies, using only " +
      "postings that disclose a range.",
    arguments: [
      {
        name: "role_or_skill",
        description:
          "The role or skill to price, e.g. 'senior backend engineer', 'Kubernetes', 'data engineer'.",
        required: true,
      },
      {
        name: "location",
        description: "Optional location filter, e.g. 'New York' or 'Remote'.",
        required: false,
      },
    ],
    buildText: (args) => {
      const loc = (args.location || "").trim();
      return [
        `What does ${args.role_or_skill} actually pay${loc ? ` in ${loc}` : ""}?`,
        "",
        "1. Check `hirejack://vocabulary/skills` (or `hirejack://vocabulary/roles`)",
        "   for the exact spelling before filtering.",
        "2. Call `search_jobs` with `has_salary=true` and `sort='salary'` so the",
        "   ranking only uses postings that actually disclose a range" +
          (loc ? `, filtered to ${loc}.` : "."),
        "3. Call it again without `sort` to get a recency-ordered sample, so you",
        "   can tell the top of the market from the typical offer.",
        "4. Compare across seniority by re-running with `seniority` set.",
        "",
        "Report: the top of the market, roughly where the middle sits, which",
        "companies anchor the high end, and how many postings disclosed pay at",
        "all (that last number matters — undisclosed ranges are excluded and",
        "they are the majority). Do not present the sorted list as a median.",
        "",
        HOSTED_NOTE,
      ].join("\n");
    },
  },
];

const PROMPTS_BY_NAME = new Map(PROMPTS.map((p) => [p.name, p]));

export function listPrompts() {
  return PROMPTS.map((p) => ({
    name: p.name,
    description: p.description,
    ...(p.arguments ? { arguments: p.arguments } : {}),
  }));
}

export function getPrompt(name: string, args: Record<string, string> = {}) {
  const prompt = PROMPTS_BY_NAME.get(name);
  if (!prompt) {
    // code -32602 (InvalidParams) so the transport maps it to a proper
    // JSON-RPC error rather than a generic InternalError.
    throw Object.assign(
      new Error(
        `Unknown prompt: ${name}. Available: ${PROMPTS.map((p) => p.name).join(", ")}`,
      ),
      { code: -32602 },
    );
  }
  for (const arg of prompt.arguments || []) {
    if (arg.required && !args[arg.name]) {
      throw Object.assign(new Error(`Missing required argument: ${arg.name}`), {
        code: -32602,
      });
    }
  }
  return {
    description: prompt.description,
    messages: [
      {
        role: "user" as const,
        content: { type: "text" as const, text: prompt.buildText(args) },
      },
    ],
  };
}
