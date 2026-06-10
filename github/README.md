# GitHub MCP

OAuth proxy for the official GitHub MCP Server — authenticates via GitHub OAuth and exposes 30+ tools for repos, issues, PRs, code search, and more.

## Features

- **30+ Tools** — Full GitHub API toolset: repository management, issue tracking, pull request workflows, code search, branch management, and more
- **OAuth Authentication** — Connect your GitHub account with one click
- **Webhook Events** — Receive real-time events from your repositories
- **Trigger System** — Configure event triggers for Mesh automations (push, PR opened, release published, etc.)

## Webhook Events

The webhook handler receives events from GitHub and matches them against configured triggers:

- `github.push` — Code pushed to a branch
- `github.pull_request.opened` — Pull request opened
- `github.pull_request.closed` — Pull request closed/merged
- `github.issues.opened` — Issue opened
- `github.release.published` — Release published
- And more (see `TRIGGER_LIST` tool)

## Repository-scoped tokens & synthetic refresh

`MINT_REPO_TOKEN` mints a short-lived (~1h) GitHub App installation token scoped
to exactly one repository (least privilege), gated on the caller's own GitHub
entitlement. Alongside the `ghs_` token it issues a durable, revocable
**synthetic refresh token** (an MCP-issued repo grant — `ghr_<grantId>.<secret>`,
NOT a GitHub refresh token) and returns its `tokenEndpoint` + `clientId`.

Two unauthenticated OAuth-shaped endpoints redeem/revoke that grant using only
the GitHub App credentials (no user-to-server token at refresh time):

- `POST /repo-grant/token` — `grant_type=refresh_token` → a fresh `ghs_` token
  scoped to the same installation/repo/permissions. `400 invalid_grant` is
  permanent (revoked/expired/unknown, or the App lost repo access); `503` is
  transient (GitHub outage, rate limit, or server misconfig) and the grant is
  kept.
- `POST /repo-grant/revoke` — RFC 7009 revocation (always `200`).

Grants are stored in the `REPO_GRANTS` Cloudflare KV namespace (only the
SHA-256 of the secret is persisted; sliding 90-day TTL).

## Architecture

```
Client → OAuth Proxy (this MCP) → api.githubcopilot.com/mcp/
GitHub Webhooks → /webhooks/github → Installation mapping → Trigger matching
MINT_REPO_TOKEN → mint ghs_ + issue grant (REPO_GRANTS KV)
POST /repo-grant/token|revoke → re-mint / revoke via GitHub App JWT
```

---

## Development

### Prerequisites

This MCP requires a **GitHub App** (not a plain OAuth App) because webhook routing depends on installation IDs. The GitHub App must have:

- OAuth enabled ("Request user authorization during installation")
- Webhook permissions for the desired events
- A callback URL matching your deployment

### Environment Variables

```bash
GITHUB_APP_ID=<github-app-id>
GITHUB_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
GITHUB_CLIENT_ID=<github-app-client-id>
GITHUB_CLIENT_SECRET=<github-app-client-secret>
GITHUB_WEBHOOK_SECRET=<webhook-secret>  # Required for webhook signature verification
PUBLIC_BASE_URL=<public-origin>         # Optional; defaults to https://github-mcp.decocms.com
```

`GITHUB_PRIVATE_KEY` accepts raw PEM, a single-line env value with `\n` escapes, or base64-encoded PEM.

`PUBLIC_BASE_URL` is the origin used to build the absolute `tokenEndpoint` that `MINT_REPO_TOKEN` returns; it must point at this deployment. The synthetic refresh flow also needs the `REPO_GRANTS` KV namespace bound in `wrangler.toml` (create with `bunx wrangler kv namespace create REPO_GRANTS`).

### Running locally

```bash
bun install
bun run dev        # Development mode
bun run dev:link   # With Mesh linking
bun run check      # Type check
bun run build      # Production build
```
