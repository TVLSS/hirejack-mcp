# @hirejack/mcp

Model Context Protocol server that exposes HireJack's tech job market
intelligence to MCP-compatible clients (Claude Desktop, Claude Code, Cursor,
Cline, etc.) — tech jobs, companies, skills, salaries, hiring trends.

[![npm](https://img.shields.io/npm/v/@hirejack/mcp.svg)](https://www.npmjs.com/package/@hirejack/mcp)

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

Restart Claude Desktop. Then try:

- *"Find remote senior backend roles paying $200K+ that sponsor visas"*
- *"What is Stripe currently hiring?"*
- *"Which fintech companies are scaling fastest?"*
- *"What skills are trending in tech right now?"*

The npm package uses **stdio transport** — no auth, runs locally as a subprocess.
The public tools work out of the box. Pro+ intelligence tools (`match_job`,
`company_fit`, `resume_rewrite`, etc.) require an authenticated user; for that
you'll want the hosted HTTP transport at `https://hirejack.com/api/mcp` once
the claude.ai connector regression is resolved (see below).

> **Why stdio first?** The hosted HTTP transport at `https://hirejack.com/api/mcp`
> works end-to-end via direct API (curl/SDK), but claude.ai's web connector and
> Claude Desktop's remote MCP UI have an upstream auth-handshake regression that
> drops the connection after OAuth succeeds. Stdio sidesteps the bug entirely.
> Tracking: [anthropics/claude-ai-mcp#136](https://github.com/anthropics/claude-ai-mcp/issues/136).

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

**Premium tier** (requires `premium`):

| Tool | Purpose |
|------|---------|
| `resume_rewrite` | Bullet-by-bullet resume rewrites tailored to a specific job |
| `interview_prep` | Targeted prep: key topics, likely questions by type, company research items |

**Analyst** (Pro+ tier today; will tighten to a dedicated `analyst` tier when that pricing plan ships):

| Tool | Purpose |
|------|---------|
| `get_company_history` | Per-company time-series: monthly hiring snapshots + wider job-count history |
| `get_skill_history` | Per-skill time-series: companyCount + jobMentions per month with MoM deltas |
| `get_market_history` | Market-wide time-series: 90 days daily or 24 months monthly |
| `compare_companies` | Up to 5 companies side-by-side: current state + monthly trajectory |
| `find_companies` | Multi-axis segmentation: industry × family × skill × trend × job-count band |
| `find_breakout_companies` | Companies with extreme hiring growth (% threshold + min size) |
| `find_emerging_skills` | Low-adoption skills growing fast (the "what should I learn before everyone else" tool) |

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
