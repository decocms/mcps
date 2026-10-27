# Grain MCP

Grain MCP is maintained by deco and built on Grain's public API (v2). It gives
AI agents live access to the meeting recordings **your Grain API key can see**:
list them, get one with its summary, participants and highlights, or fetch just
the transcript or just the summary (fewer tokens).

It keeps no state: no index, no webhooks, no database. Each call goes to
Grain with the key of the connection that made it.

> **Searching what was said across deco's calls, transcripts in a database,
> call events and the account map** live in
> [decocms/grain-indexer](https://github.com/decocms/grain-indexer) — the
> index this MCP used to keep (a `grain_meeting_recordings` table fed by
> webhooks) moved there, with full transcripts, privacy rules and signed
> webhooks.

## Authentication

1. Generate an API key at [Grain → Integrations → API](https://grain.com/app/settings/integrations?tab=api).
2. In the connection settings, paste it in the **Token** field.

The MCP reads it from `MESH_REQUEST_CONTEXT.authorization`.

## Tools

| Tool | Purpose |
| --- | --- |
| `LIST_RECORDINGS` | List and filter recordings from the Grain API |
| `GET_RECORDING` | One recording, with optional selective output (`summary`, `transcript`, `highlights`) |
| `GET_TRANSCRIPT` | Transcript URL and optional content (`json`, `txt`, `srt`, `vtt`) |
| `GET_SUMMARY` | Only the summary fields (`summary`, `summary_points`, `intelligence_notes_md`) |

## Development

```bash
bun install
bun run dev
bun run check
bun run build
```

Grain API base URL: `https://api.grain.com/_/public-api/v2`.
