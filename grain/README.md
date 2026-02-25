# Grain MCP 

Grain MCP is maintained by Deco and built on top of Grain public APIs. It gives AI agents structured access to meeting recordings, transcripts, and AI summaries, and keeps a searchable Supabase index updated by webhooks.

## What This MCP Does

- Lists recordings directly from Grain
- Retrieves full recording details by ID
- Retrieves transcript-only output to reduce token usage
- Retrieves summary-only output to reduce token usage
- Indexes webhook events into Supabase for fast local search

## Authentication

This MCP uses a Grain API key only (no OAuth flow).

1. Generate your API key at [Grain API Integrations](https://grain.com/app/settings/integrations?tab=api)
2. In Deco Mesh connection settings, paste the API key in the **Token** field
3. Save the connection

The MCP reads this value from `MESH_REQUEST_CONTEXT.authorization`.

## Webhook URL

The webhook is created automatically by API when the connection configuration changes.
This is done in `onChange` in `server/main.ts`:

- The MCP calls Grain webhooks endpoints (`listWebhooks` and `createWebhook`)
- It checks if the webhook already exists
- It creates the webhook only when missing
- The create payload includes `hook_type: "recording_added"` and `hook_url`

If you need to configure it manually in Grain, use this URL pattern:

`https://sites-grain.decocache.com/webhooks/grain/{connectionId}`

- Replace `{connectionId}` with your Deco Mesh connection ID
- This is a dedicated public webhook route (no `/mcp` in the external URL)
- Internally, the route forwards the payload to the `MESH_PUBLIC_GRAIN_WEBHOOK` tool
- The MCP also exposes a readonly `WEBHOOK_URL` template in configuration

In runtime, the MCP automatically builds this URL from Mesh context:

`{meshUrl}/webhooks/grain/{connectionId}`

If `DEVELOPMENT_MODE=true`, the MCP uses this fixed base URL instead of `meshUrl`:

`https://localhost-c056dce8.deco.host/webhooks/grain/{connectionId}`

Optional development override:

- `DEVELOPMENT_WEBHOOK_URL` (full URL)
- When set together with `DEVELOPMENT_MODE=true`, this value is used as-is without URL reconstruction

In Grain, webhook management is available in the same Integrations/API area where the API key is generated:
[Grain API Integrations](https://grain.com/app/settings/integrations?tab=api)

## Supabase Indexing

The MCP listens to `grain_recording` events and stores indexed data in Supabase table `grain_recordings`.

- Webhook setup is automatic during configuration
- New or updated recordings are upserted in Supabase
- `SEARCH_INDEXED_RECORDINGS` queries this local index for fast filtering

Create the table manually in Supabase using [`server/db/schema.sql`](server/db/schema.sql).

## Tools

| Tool | Purpose |
| --- | --- |
| `LIST_RECORDINGS` | List and filter recordings from Grain API |
| `GET_RECORDING` | Get full details for one recording, with optional selective output (`summary`, `transcript`, `highlights`) |
| `GET_TRANSCRIPT` | Get transcript URL and optional transcript content (`json`, `txt`, `srt`, `vtt`) |
| `GET_SUMMARY` | Get only summary fields (`summary`, `summary_points`, `intelligence_notes_md`) |
| `SEARCH_INDEXED_RECORDINGS` | Search Supabase-indexed recordings by query and/or date filters |

## Environment Variables

Supabase access is required for indexed search:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## Event Flow

```text
Grain webhook -> Deco Mesh event -> Grain MCP event handler -> Supabase upsert
```

The MCP also emits `grain.recording_indexed` after a successful index operation when Mesh org context is available.

## Development

```bash
bun install
bun run dev
bun run check
bun run build
```

## Notes

- Grain API base URL: `https://api.grain.com`
- This project is part of the Deco MCP monorepo

