# Creating a New MCP

## Important

**Reuse shared code:** The `/shared` directory centralizes utilities, tools, and common logic between MCPs. Always check if an implementation already exists before creating duplicate code. This maintains consistency and makes maintenance easier.

**Interface and binding patterns:** All MCPs follow the Deco Runtime pattern with well-defined interfaces, StateSchema for configuration, and a binding system for integration between apps.

## Quick Start

```bash
bun scripts/new.ts <mcp-name>
```

**Options:**
- `--description "Description"` - Set a custom description

## MCP Structure

```
my-mcp/
├── server/
│   ├── main.ts              # Main entry point
│   ├── tools/
│   │   ├── index.ts         # Exports all tools
│   │   └── my-tool.ts       # Tool implementations
│   └── lib/                 # (optional) clients and external libs
├── package.json
└── tsconfig.json
```

## Basic Configuration

### 1. main.ts

Define the StateSchema (configuration that users fill when installing):

```typescript
import { type DefaultEnv, withRuntime } from "@decocms/runtime";
import { serve } from "@decocms/mcps-shared/serve";
import { z } from "zod";

import { tools } from "./tools/index.ts";

export const StateSchema = z.object({
  apiKey: z.string().describe("Your API key"),
  // ... other fields
});

export type Env = DefaultEnv<typeof StateSchema>;

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    state: StateSchema,
  },
  tools,
});

if (runtime.fetch) {
  serve(runtime.fetch);
}
```

### 2. tools/index.ts

Export the tools that will be available:

```typescript
import { myTools } from "./my-tool.ts";

export const tools = [...myTools];
```

### 3. Implement Tools

Create files in `server/tools/` with your tools following the MCP pattern.

## After Creating

```bash
cd my-mcp
bun install
bun run dev     # Local development
bun run build   # Build for production
```

## Reference Examples

- **Simple API:** `perplexity/`, `hyperdx/` - Clean API-only MCPs
- **With StateSchema:** `object-storage/` - Good configuration example
- **With bindings:** `whatsapp/` - Shows binding integration
