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

#### Repository permissions the App must declare

`MINT_REPO_TOKEN` can only mint what the App itself declares — GitHub `422`s a
mint whose permission set exceeds the installation's grant. So the App's
**Repository permissions** must include every key in `ALLOWED_PERMISSIONS`
(`server/lib/repo-token.ts`):

| Permission     | Level | Why                                                        |
| -------------- | ----- | ---------------------------------------------------------- |
| Contents       | Read & write | clone, read, push                                    |
| Metadata       | Read  | mandatory for every GitHub App                             |
| Pull requests  | Read & write | open/update PRs                                     |
| Issues         | Read & write | open/comment issues                                 |
| Checks         | Read  | `GET_CHECK_RUN`, the PR panel's Checks tab                 |
| Deployments    | Read  | `GET_PREVIEW_DEPLOYMENT` — the only place a VTEX FastStore WebOps preview URL is published |

Adding a permission to an existing App is **not** self-applying: GitHub marks
every existing installation as having a pending permission request, and an
owner/admin of each account must accept it (`Settings → Applications → <App> →
Review request`, or the emailed prompt). Until an installation accepts, its
mints simply shed the un-approved optional (see `OPTIONAL_READ_UPGRADES`) and
keep working with the narrower set — nothing breaks, the corresponding feature
just stays dark for that org.

Once an installation does accept, its existing repo grants pick the permission
up on their next `/repo-grant/token` refresh (within ~1h). No re-import, no
re-install, no user action.

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
