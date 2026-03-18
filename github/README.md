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

## Architecture

```
Client → OAuth Proxy (this MCP) → api.githubcopilot.com/mcp/
GitHub Webhooks → /webhooks/github → Installation mapping → Trigger matching
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
GITHUB_CLIENT_ID=<github-app-client-id>
GITHUB_CLIENT_SECRET=<github-app-client-secret>
GITHUB_WEBHOOK_SECRET=<webhook-secret>  # Required for webhook signature verification
```

### Running locally

```bash
bun install
bun run dev        # Development mode
bun run dev:link   # With Mesh linking
bun run check      # Type check
bun run build      # Production build
```
