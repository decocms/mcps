# google-workspace

One OAuth login that fans out to Google's official MCP servers — Calendar, Chat, Drive, Gmail and People — exposed as a single deco MCP. After consenting once, the user gets ~33 tools prefixed `calendar_*`, `chat_*`, `drive_*`, `gmail_*`, `people_*`.

See [`TOOLS.md`](./TOOLS.md) for the full tool catalog (auto-generated).

## Built-in prompts

The MCP also exposes a set of curated prompts via the standard `prompts/list` and `prompts/get` calls. Agents can pull just the relevant guide on demand instead of stuffing every tool description into the system prompt:

- `GOOGLE_WORKSPACE_AGENT_GUIDE` — entry point covering all 5 services, the tool naming convention, time/timezone handling, destructive-action rules, and pagination.
- `GOOGLE_WORKSPACE_CALENDAR_GUIDE` — Calendar tool selection, the `primary` calendar convention, scheduling workflows, and pitfalls around recurring events.
- `GOOGLE_WORKSPACE_GMAIL_GUIDE` — Gmail search syntax (`from:`, `is:unread`, `newer_than:7d`, …), thread vs. message ops, system-label IDs, and the **drafts-only** caveat.
- `GOOGLE_WORKSPACE_DRIVE_GUIDE` — Drive structured query syntax, MIME types for Docs/Sheets/Slides, content vs. metadata vs. permissions.
- `GOOGLE_WORKSPACE_CHAT_GUIDE` — Spaces vs. DMs, threading, send-message confirmation patterns.
- `GOOGLE_WORKSPACE_PEOPLE_GUIDE` — directory (Workspace-only) vs. personal contacts, looking up the user themselves.

Source lives in [`server/prompts.ts`](./server/prompts.ts).

## How it works

Google's MCP endpoints (`calendarmcp.googleapis.com/mcp/v1`, etc.) don't accept Dynamic Client Registration, so they can't be added to mesh as a generic custom MCP today. This package wraps them: it holds the Google OAuth client ID/secret server-side and proxies JSON-RPC `tools/call` to the right backend with the user's Bearer token.

```
mesh client ──► google-workspace MCP ──► calendarmcp.googleapis.com/mcp/v1
                       │
                       ├──► chatmcp.googleapis.com/mcp/v1
                       ├──► drivemcp.googleapis.com/mcp/v1
                       ├──► gmailmcp.googleapis.com/mcp/v1
                       └──► people.googleapis.com/mcp/v1
```

The OAuth flow is the standard `createGoogleOAuth` from `@decocms/mcps-shared` — PKCE with refresh-token rotation. The full union of scopes is sent at consent time, so a single approval covers every service.

## Tool definitions are committed snapshots

Tool names, descriptions, JSON schemas and PRM scopes for each backend live in `server/tools/generated/<service>.json`. These are committed to the repo for reproducible builds.

> **Important:** Anytime Google updates one of their MCP servers (new tools, changed schemas, additional scopes), you need to refresh the snapshots manually:
>
> ```sh
> bun run generate-tools
> ```
>
> Commit the diff in `server/tools/generated/*.json`, the regenerated `TOOLS.md`, and re-deploy. The script needs no Google credentials — `tools/list` and the RFC 9728 PRM endpoint are both public.

The generator also writes `TOOLS.md` so you can preview the catalog from GitHub or the registry without booting the server.

### Why snapshot instead of fetching at boot?

- **Reproducibility:** the bundle is deterministic; an upstream change can't silently flip behavior in production.
- **Cold-start cost:** no extra round-trips to Google before the worker can serve requests.
- **Offline safety:** if Google is down at boot, the MCP still starts and returns cached tool definitions; only `tools/call` fails through to the upstream.

The trade-off is the manual refresh step above.

## Adding another Google service

When Google ships a new official MCP (e.g. `tasksmcp.googleapis.com`):

1. Add the entry to `BACKEND_MCPS` in `server/constants.ts`.
2. Update the `GoogleService` union type in the same file.
3. Add the corresponding `import` for `./tools/generated/<service>.json` and an entry in `TOOL_SNAPSHOTS`.
4. Run `bun run generate-tools` — the new service's snapshot will be created and added to `TOOLS.md`.
5. `bun run check && bun run build` to verify, then commit and PR.

Existing users get a re-consent prompt the next time they authenticate, since the union of scopes changes.

## Local development

```sh
bun install
bun run generate-tools  # First time, or after Google updates
bun run check           # tsc --noEmit
bun run dev             # Hot-reload server on PORT (default 8001)
```

To exercise the OAuth flow locally you need:

1. A Web OAuth client created in [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. The redirect URI configured to match the mesh callback used in dev (e.g. `http://localhost:4000/api/auth/callback/...`).
3. `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` exported in your environment.

Once running, the MCP exposes:

- `POST /mcp` — JSON-RPC entry. `tools/list` works without auth (handy for previewing what the user will get); `tools/call` requires the Bearer token from the OAuth flow.
- `GET /.well-known/oauth-protected-resource` — RFC 9728 metadata pointing at `accounts.google.com` and the union of scopes.

## Files

- `server/main.ts` — `withRuntime` wiring with `createGoogleOAuth` and the aggregated tool list.
- `server/constants.ts` — backend URLs, snapshot imports, scope union.
- `server/lib/mcp-proxy.ts` — JSON-RPC fetcher that injects the Bearer token and surfaces 401/403 with re-auth hints.
- `server/lib/json-schema-to-zod.ts` — small converter that turns the JSON Schema returned by Google into Zod for `createPrivateTool`.
- `server/lib/wrap-tool.ts` — turns a snapshot entry into a deco tool factory.
- `server/scripts/generate-tools.ts` — refreshes snapshots and `TOOLS.md`.
