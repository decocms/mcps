# Multi Channel Inbox 

Unified support inbox that aggregates messages from Slack, Discord and Gmail into a single interface with conversation tracking, AI classification and cross-platform replies.

## How it works

```
[Slack MCP] --event-bus--> [Multi-Channel Inbox MCP] <--poll--> [Gmail MCP]
[Discord MCP] --event-bus-->        |
                              [PostgreSQL]
                                    |
                              [React UI]
```

This MCP doesn't connect directly to Slack, Discord or Gmail. Instead, it runs inside the **deco Mesh** — an orchestration layer where multiple MCPs coexist and communicate. Each channel has its own dedicated MCP (Slack MCP, Discord MCP, Gmail MCP), and this inbox MCP aggregates their data through two mechanisms:

### Event Bus (Slack & Discord)

When a message arrives in Slack or Discord, the respective MCP publishes a CloudEvent (`slack.message.*`, `discord.message.created`) to the shared Event Bus. The inbox subscribes to these events and processes them into unified conversations stored in PostgreSQL.

Discord forum threads are fully supported — the inbox detects forum posts via `parent_id` and groups all messages within the same thread.

### Polling (Gmail)

Gmail doesn't support real-time events, so the inbox polls the Gmail MCP at a configurable interval (default: 3 minutes). It calls `gmail_search_messages` and `gmail_get_message` through the **Mesh API** — a JSON-RPC bridge that lets one MCP invoke tools from another using the target's `connection_id`.

### Mesh API for replies

When you reply to a conversation, the inbox routes the message back to the original platform by calling the source MCP's reply tool via Mesh:

- **Slack**: `SLACK_REPLY_IN_THREAD`
- **Discord**: `DISCORD_SEND_MESSAGE` (regular channels) or sends directly to the forum thread
- **Gmail**: `gmail_send_message`

### Resolve flow (Discord forums)

The `inbox_resolve_conversation` tool marks a conversation as resolved and, for Discord forum threads, automatically applies a "Solved"/"Resolvido" tag by calling `DISCORD_GET_FORUM_TAGS` + `DISCORD_EDIT_THREAD` via Mesh.

## Bindings (Mesh configuration)

| Binding | Type | Description |
|---|---|---|
| `DATABASE` | `@deco/postgres` | PostgreSQL database for conversations and messages |
| `EVENT_BUS` | `@deco/event-bus` | Receives `slack.message.*` and `discord.message.created` events |
| `CONNECTION` | `@deco/connection` | Mesh connections to Slack, Discord and Gmail MCPs |
| `MODEL_PROVIDER` | `@deco/llm` | (Optional) LLM for AI classification, summarization and reply suggestions |
| `LANGUAGE_MODEL` | Language model | (Optional) Specific model to use for AI features |
| `GMAIL_POLL_INTERVAL_MINUTES` | number | (Optional) Gmail poll interval in minutes (default: 3) |

## MCP Tools

### Source Management
- `inbox_add_source` — Add a Slack channel, Discord channel or Gmail label to monitor
- `inbox_list_sources` — List all configured sources
- `inbox_remove_source` — Disable a source (soft delete)

### Conversations
- `inbox_list_conversations` — List with filters (status, priority, source type, search) and pagination
- `inbox_get_conversation` — Get conversation detail with all messages
- `inbox_update_conversation` — Update status, priority, assignee, category, tags
- `inbox_archive_conversations` — Batch archive resolved conversations
- `inbox_stats` — Counts by source, status and priority

### Actions
- `inbox_reply` — Reply through the original platform via Mesh
- `inbox_resolve_conversation` — Mark as resolved + apply forum tags (Discord)

### AI (requires MODEL_PROVIDER)
- `inbox_classify` — Auto-classify category and priority
- `inbox_summarize` — Summarize conversation
- `inbox_suggest_reply` — Generate reply suggestion

## Structure

```
api/
├── main.ts              — Bun server with withRuntime, event bus and Gmail polling
├── types/env.ts         — StateSchema with all bindings
├── db/
│   ├── postgres.ts      — runSQL wrapper
│   └── schema.ts        — Table creation (inbox_source, inbox_conversation, inbox_message, inbox_gmail_sync_state)
├── events/handler.ts    — Event bus handler routing to Slack/Discord processors
├── ingestion/
│   ├── slack.ts         — Slack event → conversation/message (with idempotency)
│   ├── discord.ts       — Discord event → conversation/message (forum thread support)
│   ├── gmail.ts         — Poll loop with incremental sync via historyId
│   └── mesh-client.ts   — JSON-RPC helper for cross-MCP tool calls
├── tools/               — All MCP tool definitions
├── resources/inbox.ts   — Serves the React UI as MCP resource
└── lib/ai.ts            — AI classification and summarization via LLM

web/
├── router.tsx           — Tool page registry (TOOL_PAGES)
├── context.tsx          — MCP host connection and state machine
└── tools/inbox/         — Inbox React UI (conversation list, detail, reply composer)
```

## Running locally

```bash
cd multi-channel-inbox
bun install
bun run dev
```

This starts the API server on port 3001 with hot reload and the Vite web build in watch mode.

| Command | Description |
|---|---|
| `bun run dev` | API server + web build (watch mode) |
| `bun run dev:api` | API server only (port 3001) |
| `bun run dev:web` | Web build only (watch mode) |
| `bun run build` | Production build (web + server) |
| `bun run check` | TypeScript type check |
| `bun run ci:check` | Biome lint + format (CI) |
| `bun run fmt` | Auto-format with Biome |
| `bun test` | Run tests |

The MCP endpoint is exposed at `http://localhost:3001/api/mcp` (SSE transport).

> **Note**: The inbox depends on Mesh bindings (DATABASE, EVENT_BUS, CONNECTION) that are only available in the deco platform. Local development is useful for UI work and type checking, but full end-to-end testing requires deploying to the Mesh.
