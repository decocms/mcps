---
name: decocms-mcp-development
description: Build and maintain MCPs in the decocms/mcps monorepo. Covers deco HTTP server pattern (withRuntime, createPrivateTool), tool definitions, app.json config, and the two MCP types: custom server vs official external server.
---

# MCP Development — decocms/mcps

Working directory: `/Users/jonasjesus/conductor/workspaces/mcps/san-antonio` (or `/Users/jonasjesus/Documents/decocms/mcps` on main worktree)

## When to Use This Skill

- Creating a new MCP from scratch
- Adding tools to an existing MCP
- Migrating a custom MCP to an official server
- Understanding the project structure
- Fixing tool definitions, env handling, or app.json

---

## Two Types of MCPs

### Type 1: Official Server (app.json only)

The MCP runs on an external server (Cloudflare, Grain, GitHub, etc.). We only provide:
- `app.json` — connection URL, auth, metadata
- `README.md` — optional

No `package.json`, no `deploy.json` entry, no workspace entry in root `package.json`.

**Example**: `apify/`, `cloudflare-ai-gateway/`, `grain-official/`

### Type 2: Custom Server (deco HTTP)

We build and host the server. Files:
```
<mcp-name>/
  app.json          # registry metadata + connection URL
  package.json      # deps: @decocms/runtime, zod, etc.
  tsconfig.json
  server/
    main.ts         # withRuntime entry point
    tools/
      index.ts      # export const tools = [...]
      <name>.ts     # tool definitions
    lib/
      env.ts        # getApiKey(env)
      <client>.ts   # API client
    constants.ts
  shared/
    deco.gen.ts     # Env interface (auto-generated)
```

---

## Custom Server Pattern

### `server/main.ts`

```typescript
import { withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";
import { tools } from "./tools/index.ts";
import type { Env } from "../shared/deco.gen.ts";
export type { Env };

const runtime = withRuntime<Env>({
  tools: (env: Env) => tools.map((createTool) => createTool(env)),
});

if (runtime.fetch) { serve(runtime.fetch); }
```

### `shared/deco.gen.ts`

```typescript
export interface MeshRequestContext {
  authorization: string;
}
export interface Env {
  MESH_REQUEST_CONTEXT: MeshRequestContext;
}
```

### `server/lib/env.ts` — Reading API key

```typescript
import type { Env } from "../../shared/deco.gen.ts";

export function getApiKey(env: Env): string {
  const auth = env.MESH_REQUEST_CONTEXT?.authorization ?? "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : auth;
}
```

API key always comes from `env.MESH_REQUEST_CONTEXT.authorization` (Bearer token).

### `server/tools/<name>.ts` — Tool definition

```typescript
import { createPrivateTool } from "@decocms/runtime/tools";
import type { Env } from "../../shared/deco.gen.ts";
import { z } from "zod";
import { getApiKey } from "../lib/env.ts";

export const createMyTool = (env: Env) =>
  createPrivateTool({
    name: "my_tool_name",
    description: "What this tool does",
    inputSchema: z.object({
      param: z.string().describe("Description of param"),
      optional_param: z.string().optional(),
    }),
    handler: async ({ param, optional_param }) => {
      const apiKey = getApiKey(env);
      // ... call API
      return { result: "..." };
    },
  });
```

### `server/tools/index.ts`

```typescript
import { createMyTool } from "./my-tool.ts";

export const tools = [createMyTool];
```

### `package.json`

```json
{
  "name": "<mcp-name>",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "bun run ../scripts/build-mcp.ts",
    "dev": "bun run server/main.ts"
  },
  "dependencies": {
    "@decocms/runtime": "^1.2.10",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@decocms/mcps-shared": "workspace:*"
  }
}
```

---

## `app.json` — Registry Config

```json
{
  "scopeName": "deco",
  "name": "<mcp-name>",
  "friendlyName": "Display Name",
  "connection": {
    "type": "HTTP",
    "url": "https://sites-<mcp-name>.decocache.com/mcp"
  },
  "description": "Short description (1-2 sentences)",
  "icon": "https://...",
  "unlisted": false,
  "auth": {
    "type": "token",
    "header": "Authorization",
    "prefix": "Bearer"
  },
  "metadata": {
    "categories": ["Developer Tools"],
    "official": false,
    "tags": ["tag1", "tag2"],
    "short_description": "One-line description",
    "mesh_description": "Long description for AI agents (2-3 paragraphs)"
  }
}
```

For **official external servers**, remove the `auth` field and set `"official": true`.

---

## Adding a New MCP to the Monorepo

1. Create `<mcp-name>/` directory with files above
2. Add to root `package.json` workspaces array (alphabetical)
3. Add entry to `deploy.json` with `platformName: "kubernetes-bun"` (for custom servers)
4. Run `bun install` to update `bun.lock`

---

## Migrating Custom MCP to Official Server

When an official HTTP server exists (e.g., `https://api.example.com/mcp`):

1. Update `app.json` — change `connection.url` to official URL, set `"official": true`
2. Remove server code: `rm -rf server/ shared/ package.json tsconfig.json`
3. Remove from `deploy.json`
4. Remove from root `package.json` workspaces
5. Run `bun install`

---

## Key Packages

| Package | Purpose |
|---------|---------|
| `@decocms/runtime` | `withRuntime`, `createPrivateTool` |
| `@decocms/mcps-shared` | `serve` utility |
| `zod` | Input schema validation |
| `undici` | Proxy-aware fetch, SSE streaming |

## Common Patterns

- **Timeout safety**: `const parsed = parseInt(val, 10); const timeout = Number.isNaN(parsed) ? 30000 : parsed;`
- **Country codes**: `z.string().length(2).toUpperCase().optional()`
- **SSE streaming**: Use `undici` + process remaining buffer after stream loop ends
