# Security Policy

## Reporting a Vulnerability

Please report security issues privately to **support@tvlss.com**. Include the
affected version (`npm ls @hirejack/mcp`), reproduction steps, and what an
attacker could achieve. Please do not open a public issue for a vulnerability.

We aim to acknowledge reports within 3 business days.

## Supported Versions

Only the latest published version of `@hirejack/mcp` receives security fixes.

## Scope

This repository is the **stdio** MCP server. Its five unauthenticated tools read
public job-market data from the HireJack API; it stores no credentials on disk.

Authenticated tools are reached through the hosted endpoint over OAuth 2.1 +
PKCE — tokens are issued and validated server-side, so issues in that flow, in
tier gating, or in the API itself are **not** in this repository. Report those
to the same address and note that they concern the hosted service.
