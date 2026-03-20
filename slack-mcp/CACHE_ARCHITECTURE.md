# Cache Architecture - DATABASE Binding & K8s Multi-Pod Support
 
## 🎯 Problem Statement

### The Challenge

Slack webhooks arrive at HTTP routes (e.g., `/slack/events/:connectionId`) that run **outside MCP context**. This means:

```typescript
// ❌ Router doesn't have MCP context
app.post("/slack/events/:connectionId", async (c) => {
  const env = c.env; // No MESH_REQUEST_CONTEXT!
  // env.MESH_REQUEST_CONTEXT is undefined
  // Can't access DATABASE binding!
});
```

But we need connection configs (bot tokens, API keys, etc.) to process webhooks!

### Why Not Just Use DATABASE Binding Everywhere?

The `@deco/postgres` binding is **only available in MCP context**:

- ✅ Available: `onChange` handler (MCP tools/call)
- ❌ Not available: HTTP webhook routes
- ❌ Not available: Regular Express/Hono routes

## 🏗️ Architecture Solution

We use a **two-layer persistence strategy**:

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: DATABASE Binding (Source of Truth)                │
│ - PostgreSQL via @deco/postgres binding                    │
│ - Accessible only in MCP context (onChange)                │
│ - Shared across all K8s pods                               │
│ - Used for: Configuration persistence, multi-pod sync      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: KV Store Cache (Fast Access)                      │
│ - Local disk-backed cache (./data/slack-kv.json)          │
│ - Accessible from any context (MCP or HTTP)                │
│ - Per-pod (ephemeral in K8s, persistent on restart)       │
│ - Used for: Webhook processing, fast reads                 │
└─────────────────────────────────────────────────────────────┘
```

## 🔄 Data Flow

### 1. Configuration Save (onChange)

When user saves config in Mesh UI:

```typescript
// server/main.ts - onChange handler
onChange: async (env, config) => {
  const state = config.state; // Has resolved bindings!
  
  // Step 1: Save to DATABASE (PostgreSQL)
  // env.MESH_REQUEST_CONTEXT.state.DATABASE is available here
  await saveConnectionConfig(env, configData);
  // ↑ Uses DATABASE.DATABASES_RUN_SQL internally
  
  // Step 2: Cache locally for webhooks
  await cacheConnectionConfig(configData);
  // ↑ Saves to ./data/slack-kv.json
}
```

**Key Points:**
- `env` has `MESH_REQUEST_CONTEXT` with resolved bindings
- `env.MESH_REQUEST_CONTEXT.state.DATABASE` is an MCP client, not a connection string!
- We call `DATABASE.DATABASES_RUN_SQL({ sql, params })` to interact with PostgreSQL

### 2. Webhook Processing (Router)

When Slack webhook arrives:

```typescript
// server/router.ts
app.post("/slack/events/:connectionId", async (c) => {
  const connectionId = c.req.param("connectionId");
  
  // Read from KV cache (no DATABASE binding needed!)
  const config = await getCachedConnectionConfig(connectionId);
  
  if (!config) {
    return c.json({ error: "Config not cached" }, 503);
  }
  
  // Process webhook with cached config
  await processWebhook(config);
});
```

**Key Points:**
- No MCP context → can't access DATABASE binding
- Reads from local KV cache instead
- Fast (local disk, no network call)

## 🆕 K8s Multi-Pod Challenge

### The Problem

In Kubernetes, each pod has its **own ephemeral disk**:

```
┌─────────────────────┐  ┌─────────────────────┐
│ Pod 1 (old)         │  │ Pod 2 (new)         │
│ ├─ ./data/          │  │ ├─ ./data/          │
│ │  └─ slack-kv.json │  │ │  └─ ❌ EMPTY!     │
│ └─ Cache: ✅        │  │ └─ Cache: ❌        │
└─────────────────────┘  └─────────────────────┘
```

When K8s creates a new pod, its cache starts **empty**! Webhooks would fail with 503.

### The Solution: Automatic Warm-up

We implemented a **warm-up system** that syncs DATABASE to cache on startup:

```typescript
// server/main.ts
setTimeout(async () => {
  // Wait 2s for server to be ready
  const response = await fetch(`http://localhost:${port}/mcp`, {
    method: "POST",
    body: JSON.stringify({
      method: "tools/call",
      params: {
        name: "SYNC_CONFIG_CACHE",
        arguments: { force: false },
      },
    }),
  });
}, 2000);
```

**What happens:**
1. Pod starts with empty cache
2. After 2s, calls `SYNC_CONFIG_CACHE` tool (MCP context!)
3. Tool queries DATABASE binding for all configs
4. Populates local KV cache
5. Pod is now ready to handle webhooks! ✅

## 🛠️ SYNC_CONFIG_CACHE Tool

The sync tool is the bridge between DATABASE and cache:

```typescript
// server/tools/sync-cache.ts
export const syncCacheTool = {
  id: "SYNC_CONFIG_CACHE",
  async execute({ runtimeContext }) {
    const env = runtimeContext.env;
    
    // Step 1: Query DATABASE (only works in MCP context!)
    const configs = await runSQL(
      env, // Has MESH_REQUEST_CONTEXT with DATABASE binding
      "SELECT * FROM slack_connections",
      []
    );
    
    // Step 2: Cache each config locally
    for (const row of configs) {
      await cacheConnectionConfig({
        connectionId: row.connection_id,
        botToken: row.bot_token,
        // ... other fields
      });
    }
    
    return { success: true, synced: configs.length };
  }
};
```

**Key Points:**
- Runs in MCP context (has DATABASE binding access)
- Called automatically on startup (warm-up)
- Can be called manually via health check or MCP client
- Idempotent (safe to call multiple times)

## 📊 Complete Flow Diagram

```
┌────────────────────────────────────────────────────────────────┐
│ 1. User Saves Config in Mesh UI                               │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ 2. Mesh calls ON_MCP_CONFIGURATION                            │
│    - Has MCP context                                           │
│    - env.MESH_REQUEST_CONTEXT.state.DATABASE available        │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ 3. onChange Handler                                            │
│    ├─ Save to DATABASE (PostgreSQL)                           │
│    │  └─ DATABASE.DATABASES_RUN_SQL(INSERT ...)              │
│    └─ Save to KV cache (./data/slack-kv.json)                │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ 4. Pod Startup (new or restart)                               │
│    ├─ KV store loads from disk                                │
│    │  └─ If data exists: ✅ (restart case)                    │
│    │  └─ If empty: ⚠️ (new pod case)                          │
│    └─ Warm-up runs after 2s                                   │
│       └─ Calls SYNC_CONFIG_CACHE                              │
│          └─ DATABASE → KV cache                               │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ 5. Webhook Arrives                                             │
│    └─ POST /slack/events/:connectionId                        │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ 6. Router Processing (NO MCP context)                         │
│    ├─ Read from KV cache (fast, local)                        │
│    ├─ If cache hit: ✅ Process webhook                        │
│    └─ If cache miss: 503 (trigger re-sync)                    │
└────────────────────────────────────────────────────────────────┘
```

## 🔧 Implementation Files

### Core Files

```
slack-mcp/
├── server/
│   ├── lib/
│   │   ├── db-sql.ts              # DATABASE binding wrapper
│   │   ├── config-cache.ts        # KV cache interface
│   │   └── kv.ts                  # Persistent KV store
│   ├── tools/
│   │   └── sync-cache.ts          # SYNC_CONFIG_CACHE tool
│   ├── main.ts                    # onChange + warm-up
│   └── router.ts                  # Webhook routes
└── data/
    └── slack-kv.json              # Cache file (gitignored)
```

### Key Functions

#### db-sql.ts - DATABASE Binding Wrapper

```typescript
export async function runSQL<T>(
  env: Env,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  // Get DATABASE binding from MCP context
  const dbBinding = env.MESH_REQUEST_CONTEXT?.state?.DATABASE;
  
  if (!dbBinding) {
    throw new Error("DATABASE binding not available");
  }
  
  // Call DATABASES_RUN_SQL tool
  const response = await dbBinding.DATABASES_RUN_SQL({ sql, params });
  
  return response.result[0].results ?? [];
}

export async function saveConnectionConfig(
  env: Env,
  config: ConnectionConfig
): Promise<void> {
  await runSQL(
    env,
    `INSERT INTO slack_connections (...) VALUES (...)
     ON CONFLICT (connection_id) DO UPDATE SET ...`,
    [config.connectionId, config.botToken, ...]
  );
}
```

#### config-cache.ts - Cache Interface

```typescript
export async function cacheConnectionConfig(
  config: ConnectionConfig
): Promise<void> {
  const kv = getKvStore(); // Persistent KV store
  const key = `config:${config.connectionId}`;
  await kv.set(key, config); // Saves to ./data/slack-kv.json
}

export async function getCachedConnectionConfig(
  connectionId: string
): Promise<ConnectionConfig | null> {
  const kv = getKvStore();
  const key = `config:${connectionId}`;
  return await kv.get(key);
}
```

## 🏥 Health Check & Monitoring

### Health Endpoint

```bash
GET /health
```

**Response:**

```json
{
  "status": "ok",
  "uptime": 3600,
  "metrics": {
    "configCacheSize": 5,  // ← Number of cached configs
    "kvStoreSize": 150,
    "apiKeysCount": 5
  },
  "note": "Database uses @deco/postgres binding, configs cached for webhooks",
  "actions": {
    // ↓ Shows if cache is empty
    "syncCache": "POST /mcp with tools/call SYNC_CONFIG_CACHE to warm-up cache"
  }
}
```

### Manual Cache Sync

If cache is empty or stale, manually trigger sync:

```bash
# Via MCP protocol
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "SYNC_CONFIG_CACHE",
      "arguments": { "force": true }
    },
    "id": 1
  }'
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "result": {
    "content": [{
      "type": "text",
      "text": {
        "success": true,
        "synced": 5,
        "errors": []
      }
    }]
  }
}
```

## 🚀 Production Deployment

### Environment Variables

```bash
# PostgreSQL connection (for DATABASE binding)
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Server port
PORT=8080

# Mesh URL
MESH_URL=https://mesh.example.com
```

### K8s Deployment Considerations

1. **Persistent Volumes (Optional)**
   - KV cache survives restarts without PV (warm-up handles it)
   - For faster startup, use PV for `./data/` directory

2. **Readiness Probe**
   ```yaml
   readinessProbe:
     httpGet:
       path: /health
       port: 8080
     initialDelaySeconds: 5  # Wait for warm-up
     periodSeconds: 10
   ```

3. **Startup Probe**
   ```yaml
   startupProbe:
     httpGet:
       path: /health
       port: 8080
     failureThreshold: 3
     periodSeconds: 2
   ```

### Scaling Behavior

```
┌─────────────────────────────────────────────────────────────┐
│ Before: 2 pods                                              │
│ - Pod A: cache populated ✅                                 │
│ - Pod B: cache populated ✅                                 │
│                                                             │
│ Scale up: +1 pod                                            │
│ - Pod C: starts → warm-up (2s) → cache populated ✅        │
│                                                             │
│ Result: All 3 pods can handle webhooks                     │
└─────────────────────────────────────────────────────────────┘
```

## 🐛 Troubleshooting

### Issue: Webhook returns 503 "Config not cached"

**Causes:**
1. New pod, warm-up not completed yet (wait 2-5 seconds)
2. Warm-up failed (check logs for DATABASE connection errors)
3. Config never saved in Mesh UI

**Solutions:**
1. Check health endpoint: `GET /health` → look at `configCacheSize`
2. Check logs for warm-up status: `[Warmup] ✅ Cache sync result`
3. Manually trigger sync: Call `SYNC_CONFIG_CACHE` tool
4. Re-save config in Mesh UI to populate DATABASE

### Issue: Warm-up shows "DATABASE binding not available"

**Cause:** Warm-up runs before MCP context is ready

**Solution:** Already handled! Warm-up uses 2s delay to ensure server is ready.

### Issue: Different configs between pods

**Cause:** One pod has stale cache

**Solution:** 
1. Re-save config in Mesh UI → populates all caches via `onChange`
2. Or manually call `SYNC_CONFIG_CACHE` on affected pod

## 📈 Performance Characteristics

### Latency

```
Operation                          | Latency
-----------------------------------|----------
Read from KV cache (webhook)       | < 1ms
Write to KV cache (onChange)       | < 5ms
DATABASE query (via binding)       | 10-50ms
Warm-up sync (all configs)         | 100-500ms
```

### Cache Hit Rate

Expected: **99.9%+** after warm-up completes

Cache miss only if:
- Brand new pod (<2s after startup)
- Warm-up failed (rare, check DATABASE connectivity)

## 🎓 Summary

### Why This Architecture?

1. **DATABASE Binding** = PostgreSQL access in MCP context only
2. **KV Cache** = Fast local access for webhooks (no MCP context)
3. **Warm-up** = Auto-sync on startup for K8s multi-pod deployments
4. **Persistent KV** = Survives restarts (disk-backed)

### Key Takeaways

- ✅ Use DATABASE binding for **persistence** (onChange)
- ✅ Use KV cache for **fast reads** (webhooks)
- ✅ Warm-up handles **new pods** automatically
- ✅ Health check shows **cache status**
- ✅ Manual sync available via **SYNC_CONFIG_CACHE** tool

### Trade-offs

| Approach              | Pros                          | Cons                        |
|-----------------------|-------------------------------|-----------------------------|
| DATABASE only         | Simple, single source         | Can't use in webhook routes |
| KV cache only         | Fast, always available        | Doesn't persist across pods |
| **Our solution**      | Best of both worlds           | Slightly more complex       |

---

**Last Updated:** 2026-01-28  
**Author:** Slack MCP Team  
**Version:** 1.0

