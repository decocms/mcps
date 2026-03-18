# GitHub MCP

OAuth proxy for the official GitHub MCP Server — authenticates via GitHub OAuth and exposes 30+ tools (repos, issues, PRs, code search, and more).

## Features

- **OAuth Proxy**: Wraps the official GitHub MCP at `api.githubcopilot.com` with OAuth authentication
- **30+ Tools**: Full GitHub API toolset (repos, issues, PRs, code search, branches, etc.)
- **Webhook Routing**: Receives GitHub webhook events and routes them to the correct connection
- **Trigger System**: Configure event triggers for Mesh automations
- **Signature Verification**: Secure webhook verification using HMAC-SHA256

## Architecture

```
Client → OAuth Proxy (this MCP) → api.githubcopilot.com/mcp/
GitHub Webhooks → /webhooks/github → Installation mapping → Trigger matching
```

## Setup

### 1. Create a GitHub OAuth App

1. Go to GitHub Settings → Developer settings → OAuth Apps → New OAuth App
2. Set the callback URL to match your deployment
3. Note the Client ID and Client Secret

### 2. Environment Variables

```bash
GITHUB_CLIENT_ID=<client-id>
GITHUB_CLIENT_SECRET=<client-secret>
GITHUB_WEBHOOK_SECRET=<webhook-secret>  # Required for webhook verification
```

### 3. Install the MCP

Install in your MCP Mesh and complete the OAuth flow.

## Webhook Events

The webhook handler receives events from GitHub and matches them against configured triggers:

- `github.push` — Code pushed to a branch
- `github.pull_request.opened` — Pull request opened
- `github.pull_request.closed` — Pull request closed/merged
- `github.issues.opened` — Issue opened
- `github.release.published` — Release published
- And more (see `TRIGGER_LIST` tool)

## Development

```bash
bun install
bun run dev        # Development mode
bun run dev:link   # With Mesh linking
bun run check      # Type check
bun run build      # Production build
```
