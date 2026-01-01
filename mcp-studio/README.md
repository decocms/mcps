# MCP Studio

MCP server for managing workflows, executions, assistants, and prompts. Supports both HTTP and stdio transports.

## Features

- **Workflows**: Create, update, delete, and list workflow definitions
- **Executions**: View and manage workflow execution history
- **Assistants**: Manage AI assistant configurations
- **Prompts**: Store and retrieve prompt templates

## Usage

### HTTP Transport (Mesh Web Connection)

```bash
# Development with hot reload
bun run dev

# Production
bun run build:server
node dist/server/main.js
```

### Stdio Transport (Mesh Custom Command)

```bash
# Run directly
bun run stdio

# Development with hot reload
bun run dev:stdio
```

#### Adding to Mesh as Custom Command

In Mesh, add a new custom command connection:

1. Go to **MCPs** → **Add MCP** → **Custom Command**
2. Configure the command:
   - **Command**: `bun`
   - **Args**: `--watch /path/to/mcp-studio/server/stdio.ts`
3. Click **Save** - Mesh will spawn the process and fetch the tools
4. Go to the **Settings** tab to configure the database binding
5. Select a PostgreSQL connection from the **Database** dropdown
6. Click **Save Changes**

This enables:
- Live reloading during development
- Mesh bindings UI for database configuration (same dropdowns as HTTP connections)
- Automatic migrations when bindings are configured

## Bindings

The stdio transport supports Mesh bindings via:

- `MCP_CONFIGURATION` - Returns the state schema for the bindings UI (uses `BindingOf` format)
- `ON_MCP_CONFIGURATION` - Receives configured bindings (connection IDs) and runs migrations

The binding schema uses the same format as HTTP mode:
```typescript
const StdioStateSchema = z.object({
  DATABASE: BindingOf("@deco/postgres").describe("PostgreSQL database binding"),
});
```

This renders as a dropdown in Mesh UI showing all connections that implement `@deco/postgres`.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (e.g., from Supabase project settings) |

**Note**: STDIO connections receive binding configuration (connection IDs) from Mesh, but still require `DATABASE_URL` env var for actual database connectivity. This is because STDIO processes cannot proxy database calls through Mesh.

## Available Tools

### Workflow Collection
- `COLLECTION_WORKFLOW_LIST` - List all workflows
- `COLLECTION_WORKFLOW_GET` - Get a single workflow by ID
- `COLLECTION_WORKFLOW_CREATE` - Create a new workflow
- `COLLECTION_WORKFLOW_UPDATE` - Update an existing workflow
- `COLLECTION_WORKFLOW_DELETE` - Delete a workflow

### Execution Collection
- `COLLECTION_WORKFLOW_EXECUTION_LIST` - List workflow executions
- `COLLECTION_WORKFLOW_EXECUTION_GET` - Get execution details with step results

### Assistant Collection
- `COLLECTION_ASSISTANT_LIST` - List all assistants
- `COLLECTION_ASSISTANT_GET` - Get a single assistant by ID
- `COLLECTION_ASSISTANT_CREATE` - Create a new assistant
- `COLLECTION_ASSISTANT_UPDATE` - Update an existing assistant
- `COLLECTION_ASSISTANT_DELETE` - Delete an assistant

### Prompt Collection
- `COLLECTION_PROMPT_LIST` - List all prompts
- `COLLECTION_PROMPT_GET` - Get a single prompt by ID

## Development

```bash
# Install dependencies
bun install

# Type check
bun run check

# Format code
bun run fmt
```
