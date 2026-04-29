# Dropbox MCP

OAuth-authenticated tools for the Dropbox API v2 — files, folders, sharing, and account info.

## Features

- **Files / folders** — list, search, get metadata, download, get temporary link, upload, create folder, move, copy, delete, restore, list revisions
- **Sharing** — create shared links, list shared links, share folders, add folder members
- **Account** — current account info, space usage
- **OAuth 2.0 + PKCE** with offline refresh tokens (access tokens expire ~4h)

## Auth

Register a Dropbox app in the [App Console](https://www.dropbox.com/developers/apps) with Scoped access (Full Dropbox), then set the redirect URI to your deployment.

Required scopes (least privilege):

```
account_info.read
files.metadata.read
files.metadata.write
files.content.read
files.content.write
sharing.read
sharing.write
```

`token_access_type=offline` is requested so we receive a refresh_token alongside the short-lived access_token.

## Architecture

The worker is stateless — there is no KV namespace and no webhook ingress. The user's bearer token rides in via `MESH_REQUEST_CONTEXT.authorization` on every tool call and is forwarded to the Dropbox API.

```
Client → withRuntime (this MCP) → api.dropboxapi.com / content.dropboxapi.com
```

---

## Development

### Environment Variables

Set via `bunx wrangler secret put`:

```bash
DROPBOX_CLIENT_ID=<dropbox-app-key>
DROPBOX_CLIENT_SECRET=<dropbox-app-secret>
```

### Running locally

```bash
bun install
bun run dev        # Development mode
bun run check      # Type check
bun run build      # Production build (wrangler deploy --dry-run)
bun run deploy     # Deploy to Cloudflare
```
