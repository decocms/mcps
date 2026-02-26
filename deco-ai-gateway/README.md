# Deco AI Gateway

LLM gateway powered by [OpenRouter](https://openrouter.ai), with **automatic API key provisioning per organization** and built-in spending visibility.

Each org that installs this MCP gets its own isolated OpenRouter key — created transparently on the first LLM call, stored AES-256-GCM encrypted in Supabase, and reused on every subsequent call.

---

## Features

- **Auto Provisioning** — no manual key management; the gateway provisions an org-scoped OpenRouter key on first use
- **Multi-model support** — access GPT-4o, Claude 3.5 Sonnet, Gemini, Llama, Mistral, and 300+ models via a single MCP
- **Cost Visibility** — `GATEWAY_USAGE` tool returns real-time spending (daily, weekly, monthly) for the org's key
- **Isolation** — each org has an independent key named `decocms-mesh-org-{name}-{id}` for easy identification in OpenRouter's dashboard
- **Encryption** — keys are encrypted at rest using AES-256-GCM before being stored in Supabase

---

## Available Tools

All standard OpenRouter LLM tools are exposed (chat, streaming, model listing, etc.), plus:

| Tool | Description |
|---|---|
| `GATEWAY_USAGE` | Returns real-time spending for the org's OpenRouter key (total, daily, weekly, monthly) |

---

## Environment Variables

```env
# OpenRouter Management Key (create at https://openrouter.ai/settings/provisioning-keys)
# Used ONLY to create per-org API keys — never used for LLM calls
OPENROUTER_MANAGEMENT_KEY=

# Supabase (table: llm_gateway_connections)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=

# AES-256 key to encrypt API keys in Supabase (32 bytes hex = 64 chars)
# Generate with: openssl rand -hex 32
ENCRYPTION_KEY=
```

---

## Configuration (Optional)

The MCP exposes one optional state field:

| Field | Description |
|---|---|
| `ORGANIZATION_NAME` | Org name used in the OpenRouter key label (e.g. `minha-empresa` → `decocms-mesh-org-minha-empresa-abc123`) |

---

## Database Setup

Run the SQL script at [`server/db/schema.sql`](./server/db/schema.sql) in your Supabase project to create the `llm_gateway_connections` table with Row Level Security enabled.

---

## How It Works

```
First LLM call
     │
     ▼
Check in-memory cache ──► hit: inject key → call OpenRouter
     │ miss
     ▼
Check Supabase ──────────► found: decrypt, cache, inject key → call OpenRouter
     │ not found
     ▼
POST /api/v1/keys (OpenRouter Provisioning API)
     │
     ├── Encrypt key (AES-256-GCM)
     ├── Store in Supabase (llm_gateway_connections)
     ├── Cache in memory
     └── inject key → call OpenRouter
```

A provisioning lock prevents race conditions — only one key is ever created per organization, even under concurrent load.

---

## Local Development

```bash
cp .env.example .env
# Fill in OPENROUTER_MANAGEMENT_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, ENCRYPTION_KEY

bun install
bun run dev
```

The server starts on `http://localhost:3000/mcp` by default (override with `PORT=3001`).
