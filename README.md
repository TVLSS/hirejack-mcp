# @hirejack/mcp

Model Context Protocol server that exposes HireJack's tech job market
intelligence to MCP-compatible clients (Claude Desktop, Claude Code, Cursor,
Cline, etc.) — tech jobs, companies, skills, salaries, hiring trends.

[![npm](https://img.shields.io/npm/v/@hirejack/mcp.svg)](https://www.npmjs.com/package/@hirejack/mcp)
[![Glama score](https://glama.ai/mcp/servers/TVLSS/hirejack-mcp/badges/score.svg)](https://glama.ai/mcp/servers/TVLSS/hirejack-mcp)

## Quick start

**Claude Code:**

```bash
claude mcp add hirejack -- npx -y @hirejack/mcp
```

**Claude Desktop** — edit `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "hirejack": {
      "command": "npx",
      "args": ["-y", "@hirejack/mcp"]
    }
  }
}
```

Restart Claude Desktop and ask away (see [Example prompts](#example-prompts)).

The npm package uses **stdio transport** — no auth, runs locally as a
subprocess, and the five public tools work out of the box.

**claude.ai / Claude Desktop connector (all 22 tools):** add
`https://hirejack.com/api/mcp` as a custom connector (Settings → Connectors →
Add custom connector), sign in with your HireJack account when prompted, and
the full Pro/Premium/Analyst intelligence surface lights up — tier-gated
server-side to your subscription.

## Example prompts

**Job search (public, no account):**

- *"Find remote senior backend roles paying $200K+ that sponsor visas"*
- *"What is Stripe currently hiring? Break it down by team."*
- *"Show me staff-level ML jobs in New York with published salary ranges"*
- *"Which companies are hiring Rust engineers right now?"*

**Market research (public, no account):**

- *"Which fintech companies are scaling hiring fastest this month?"*
- *"What skills are trending in tech right now?"*
- *"Compare the tech stacks of Datadog and Grafana Labs"*
- *"What's the median advertised salary for senior data engineers?"*

**Career intelligence (Pro/Premium, via the hosted connector):**

- *"Score my fit for this posting and tell me what's missing: hirejack.com/jobs/…"*
- *"Which skill should I learn next to unlock the most jobs?"*
- *"Where does my salary sit vs the market for staff platform engineers?"*
- *"Rewrite my resume bullets for this Anthropic role"*

**Analyst (historical/segmentation, via the hosted connector):**

- *"Which companies' hiring grew >50% in the last quarter from a real base?"*
- *"Show Nvidia's hiring trajectory over the last 12 months"*
- *"What skills are climbing consistently from a low base — early signals only"*

## Transports

| Transport | Where | Tools available |
|-----------|-------|-----------------|
| **stdio** (this package) | `npx -y @hirejack/mcp` | 5 public tools (`search_jobs`, `get_job`, `get_company_profile`, `search_companies`, `get_market_pulse`). Pro+/Analyst tools surface but require auth — point users at the hosted endpoint. |
| **HTTP + OAuth 2.1** (HireJack-hosted) | `https://hirejack.com/api/mcp` | All 22 tools, including Pro+/Analyst intelligence tied to a HireJack subscription. Implementation lives in HireJack's private Lambda; this OSS package is the stdio half. |

## Tools

**Public** (no auth required):

| Tool | Purpose |
|------|---------|
| `search_jobs` | Search live tech job postings: role family, seniority, skill, location, salary, remote, visa |
| `get_job` | Fetch one job posting by domain + jobId or HireJack URL: full details, salary, skills, AI summary |
| `get_company_profile` | Full hiring profile for one company (tech stack, trends, salary, AI brief) |
| `search_companies` | List tracked companies, filter by industry |
| `get_market_pulse` | Market-wide stats: totals, top skills, trending skills, top companies |

**Pro tier** (requires authenticated HireJack user with `pro` or higher):

| Tool | Purpose |
|------|---------|
| `match_job` | Score how well the user matches a specific job (matchPct + 5-dim breakdown + ATS tips) |
| `company_fit` | Score the user's fit for a company (fitScore + tech-stack/role/seniority breakdown) |
| `recommendations` | Top jobs ranked by composite match against the user's profile |
| `salary_benchmark` | Percentile + career-ladder benchmark vs the live market for a role/seniority |
| `skill_gap` | Compare user skills to desired-roles' market requirements; ranked missing skills |
| `market_position` | 0–100 market-position score (skill demand, seniority fit, remote, breadth) + matching jobs, salary median, top-aligned companies |
| `skill_impact` | Simulate learning each missing skill: jobs unlocked, boosted matches, companies needing it — ranked by impact |
| `watchlist_intelligence` | Aggregate hiring signals across every watched company: open jobs, week-over-week trend %, top skills, median salary, sparkline |

**Premium tier** (requires `premium`):

| Tool | Purpose |
|------|---------|
| `resume_rewrite` | Bullet-by-bullet resume rewrites tailored to a specific job |
| `interview_prep` | Targeted prep: key topics, likely questions by type, company research items |

**Analyst** (dedicated [Analyst tier](https://hirejack.com/analyst/) — $49/mo founding pricing; free for working journalists in exchange for a linked citation):

| Tool | Purpose |
|------|---------|
| `get_company_history` | Per-company time-series: monthly hiring snapshots + wider job-count history |
| `get_skill_history` | Per-skill time-series: companyCount + jobMentions per month with MoM deltas |
| `get_market_history` | Market-wide time-series: 90 days daily or 24 months monthly |
| `compare_companies` | Up to 5 companies side-by-side: current state + monthly trajectory |
| `find_companies` | Multi-axis segmentation: industry × family × skill × trend × job-count band |
| `find_breakout_companies` | Companies with extreme hiring growth (% threshold + min size) |
| `find_emerging_skills` | Skills climbing *consistently* across the last 3 monthly snapshots from a low base, with a real absolute company-count gain — early signal, not small-base noise (the "what should I learn before everyone else" tool) |

Pro+ tools are thin wrappers over the website's existing intelligence
Lambdas. Tier gating happens server-side in those Lambdas — the MCP server
just forwards the user's identity. If the user lacks the required tier,
the API returns 403 and the tool surfaces a clear upgrade hint.


## Build from source

```bash
git clone https://github.com/TVLSS/hirejack-mcp
cd hirejack-mcp
npm install
npm run build       # tsc → dist/
node dist/index.js  # waits on stdin/stdout for JSON-RPC
```

## Releasing

Publishing is automated by GitHub Actions (`.github/workflows/release.yml`).
Pushing a version tag builds, publishes to npm, and updates the MCP Registry:

```bash
npm version patch          # bumps package.json + creates the vX.Y.Z tag
git push && git push --tags
```

The workflow verifies the tag matches `package.json`, then runs `npm publish`
(using the `NPM_TOKEN` repo secret) and a best-effort MCP Registry update via
GitHub OIDC. Keep `server.json`'s `version` in step with `package.json`.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `HIREJACK_API_BASE` | `https://hirejack.com/api` | Override if you're self-hosting a fork against a different backend |
| `HIREJACK_SITE_BASE` | `https://hirejack.com` | Used in `citation_url` fields returned by tools |

The npm package ships the stdio transport only. The hosted HTTP+OAuth
endpoint at `https://hirejack.com/api/mcp` is run separately by HireJack
and not implemented in this repo.

## Project layout

```
src/
├── index.ts            # stdio entry point
├── registry.ts         # transport-agnostic tool registry
├── lib/
│   ├── api.ts          # HireJack REST client
│   ├── format.ts       # tool result helpers
│   └── proAuth.ts      # Pro+ auth check (returns "use hosted endpoint" in stdio)
└── tools/              # 22 tool implementations
```

## License

MIT — see [LICENSE](./LICENSE).

## Support

- Issues / feature requests: https://github.com/TVLSS/hirejack-mcp/issues
- General feedback: https://hirejack.com/feedback.html
- Site / product: https://hirejack.com
