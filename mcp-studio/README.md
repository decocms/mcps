# MCP Studio

MCP server for managing workflows, executions, assistants, and prompts. Supports both HTTP and stdio transports.

## Features

- **Workflows**: Create, update, delete, and list workflow definitions
- **Executions**: View and manage workflow execution history
- **Assistants**: Manage AI assistant configurations
- **Prompts**: Store and retrieve prompt templates

## Workflow Scripting Language

MCP Studio provides a declarative JSON-based language for defining multi-step tool call workflows. Workflows automatically handle dependency resolution, parallel execution, and data flow between steps.

### Core Concepts

#### Steps

A workflow is a sequence of **steps**. Each step has:

- `name`: Unique identifier (other steps reference it as `@name.field`)
- `action`: What the step does (tool call, code transform, or wait for signal)
- `input`: Data passed to the action (can include `@ref` references)
- `outputSchema`: Optional JSON Schema for output validation
- `config`: Optional retry/timeout settings

```json
{
  "name": "fetch_user",
  "action": { "toolName": "GET_USER" },
  "input": { "userId": "@input.user_id" }
}
```

#### Automatic Parallel Execution

Steps run **in parallel** unless they reference each other. The execution order is auto-determined from `@ref` dependencies:

```json
{
  "title": "Parallel Fetch",
  "steps": [
    { "name": "fetch_users", "action": { "toolName": "GET_USERS" } },
    { "name": "fetch_orders", "action": { "toolName": "GET_ORDERS" } },
    {
      "name": "merge",
      "action": { "code": "..." },
      "input": {
        "users": "@fetch_users.data",
        "orders": "@fetch_orders.data"
      }
    }
  ]
}
```

In this example:
- `fetch_users` and `fetch_orders` run **in parallel** (no dependencies)
- `merge` waits for **both** to complete (references both via `@ref`)

### The `@ref` Syntax

The `@ref` syntax wires data between steps:

| Reference | Description |
|-----------|-------------|
| `@input.field` | Workflow input data |
| `@stepName.field` | Output from a previous step |
| `@stepName.nested.path` | Nested path into step output |
| `@item` | Current item in forEach loop |
| `@index` | Current index in forEach loop |

#### Examples

```jsonc
// Direct reference - entire value
{ "user": "@fetch_user" }

// Nested path
{ "userName": "@fetch_user.profile.name" }

// String interpolation
{ "message": "Hello @fetch_user.name, your order @fetch_order.id is ready" }

// Array access
{ "firstItem": "@fetch_list.items.0" }
```

### Action Types

#### 1. Tool Call Action

Invokes an MCP tool through the configured gateway:

```json
{
  "name": "get_weather",
  "action": {
    "toolName": "WEATHER_GET_FORECAST"
  },
  "input": {
    "city": "@input.city",
    "units": "celsius"
  }
}
```

With optional result transformation:

```json
{
  "name": "get_weather",
  "action": {
    "toolName": "WEATHER_GET_FORECAST",
    "transformCode": "interface Output { temp: number } export default function(input) { return { temp: input.temperature.current } }"
  },
  "input": { "city": "@input.city" }
}
```

#### 2. Code Action

Pure TypeScript for data transformation. Runs in a sandboxed QuickJS environment:

```json
{
  "name": "merge_data",
  "action": {
    "code": "interface Input { users: User[]; orders: Order[] } interface Output { combined: Array<{ user: User; orderCount: number }> } export default function(input: Input): Output { return { combined: input.users.map(u => ({ user: u, orderCount: input.orders.filter(o => o.userId === u.id).length })) } }"
  },
  "input": {
    "users": "@fetch_users.data",
    "orders": "@fetch_orders.data"
  }
}
```

Code requirements:
- Must export a `default` function
- Optionally declare `Input` and `Output` interfaces for type extraction
- Runs in isolated sandbox (no network, filesystem, or non-deterministic APIs)

#### 3. Wait for Signal Action (Human-in-the-Loop)

Pauses execution until an external signal is received:

```json
{
  "name": "await_approval",
  "action": {
    "signalName": "approval"
  },
  "config": {
    "timeoutMs": 86400000
  }
}
```

Use `SEND_SIGNAL` tool to resume:
```json
{ "executionId": "...", "signalName": "approval", "payload": { "approved": true } }
```

### Step Configuration

Optional retry and timeout settings:

```json
{
  "name": "flaky_api_call",
  "action": { "toolName": "EXTERNAL_API" },
  "config": {
    "maxAttempts": 3,
    "backoffMs": 1000,
    "timeoutMs": 30000
  }
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `maxAttempts` | 1 | Maximum retry attempts on failure |
| `backoffMs` | - | Initial delay between retries (doubles each attempt) |
| `timeoutMs` | 30000 | Maximum execution time before timeout |

### Output Schema

Define expected output structure with JSON Schema:

```json
{
  "name": "extract_info",
  "action": { "toolName": "LLM_EXTRACT" },
  "outputSchema": {
    "type": "object",
    "properties": {
      "name": { "type": "string" },
      "age": { "type": "number" }
    },
    "required": ["name"]
  }
}
```

When `outputSchema` is provided (without `transformCode`), the step output is automatically filtered to only include properties defined in the schema.

### Complete Workflow Example

```json
{
  "id": "enrich-contact",
  "title": "Enrich Contact Information",
  "description": "Fetches contact data from multiple sources and merges into unified profile",
  "steps": [
    {
      "name": "lookup_email",
      "description": "Find email by name",
      "action": { "toolName": "CLEARBIT_LOOKUP" },
      "input": { "name": "@input.contact_name" }
    },
    {
      "name": "lookup_linkedin",
      "description": "Find LinkedIn profile",
      "action": { "toolName": "LINKEDIN_SEARCH" },
      "input": { "query": "@input.contact_name @input.company" }
    },
    {
      "name": "get_company_info",
      "description": "Fetch company details",
      "action": { "toolName": "CRUNCHBASE_COMPANY" },
      "input": { "name": "@input.company" }
    },
    {
      "name": "merge_profile",
      "description": "Combine all data sources",
      "action": {
        "code": "interface Input { email: { address: string }; linkedin: { url: string; title: string }; company: { size: string; funding: string } } interface Output { profile: { email: string; linkedinUrl: string; title: string; companySize: string; funding: string } } export default function(input: Input): Output { return { profile: { email: input.email.address, linkedinUrl: input.linkedin.url, title: input.linkedin.title, companySize: input.company.size, funding: input.company.funding } } }"
      },
      "input": {
        "email": "@lookup_email",
        "linkedin": "@lookup_linkedin",
        "company": "@get_company_info"
      },
      "outputSchema": {
        "type": "object",
        "properties": {
          "profile": {
            "type": "object",
            "properties": {
              "email": { "type": "string" },
              "linkedinUrl": { "type": "string" },
              "title": { "type": "string" },
              "companySize": { "type": "string" },
              "funding": { "type": "string" }
            }
          }
        }
      }
    }
  ]
}
```

Execution flow:
1. `lookup_email`, `lookup_linkedin`, and `get_company_info` run **in parallel**
2. `merge_profile` waits for all three, then combines results

### DAG Visualization

The workflow engine builds a **Directed Acyclic Graph (DAG)** from step dependencies. Functions available for visualization:

- `computeStepLevels(steps)` - Get execution level for each step
- `groupStepsByLevel(steps)` - Group steps by parallel execution level  
- `buildDependencyEdges(steps)` - Get `[from, to]` edges for graph visualization
- `validateNoCycles(steps)` - Check for circular dependencies

---

## Filesystem Workflow Loading

Load workflows from JSON files instead of (or alongside) the database. This enables version-controlled workflows, MCP packaging, and database-free operation.

### Configuration

```bash
# Set workflow directory (scans recursively for *.json files)
WORKFLOW_DIR=/path/to/workflows bun run stdio

# Or specify individual files
WORKFLOW_FILES=./workflows/enrich.json,./workflows/notify.json bun run stdio

# Combine with database (workflows from both sources are merged)
WORKFLOW_DIR=/path/to/workflows DATABASE_URL=... bun run stdio
```

### Directory Structure

```
workflows/
├── enrich-contact.json           # Single workflow file
├── notify-team.workflow.json     # Alternative naming convention
└── my-mcp/                       # MCPs can package workflows
    ├── workflow-a.json
    └── bundled.json              # Can contain multiple workflows
```

### File Formats

**Single workflow:**
```json
{
  "id": "enrich-contact",
  "title": "Enrich Contact",
  "description": "Fetch and merge contact data",
  "steps": [
    { "name": "lookup", "action": { "toolName": "LOOKUP_CONTACT" } }
  ]
}
```

**Multiple workflows in one file:**
```json
{
  "workflows": [
    { "id": "workflow-a", "title": "...", "steps": [...] },
    { "id": "workflow-b", "title": "...", "steps": [...] }
  ]
}
```

**Array format:**
```json
[
  { "id": "workflow-a", "title": "...", "steps": [...] },
  { "id": "workflow-b", "title": "...", "steps": [...] }
]
```

### Filesystem-Specific Tools

When filesystem mode is enabled, additional tools become available:

- `WORKFLOW_RELOAD` - Reload all workflows from disk (after editing files)
- `WORKFLOW_SOURCE_INFO` - Show where workflows are loaded from

### Hot Reload

When `WORKFLOW_DIR` is set, file changes are automatically detected and workflows are reloaded. Edit a JSON file and the changes are immediately available.

### Source Filtering

The `COLLECTION_WORKFLOW_LIST` tool accepts a `source` parameter:

```json
{ "source": "filesystem" }  // Only filesystem workflows
{ "source": "database" }    // Only database workflows  
{ "source": "all" }         // Both (default)
```

Each workflow in the response includes `_source: "filesystem" | "database"` to identify its origin.

### Use Cases

1. **Version Control**: Store workflows in git alongside code
2. **MCP Packaging**: MCPs can ship pre-built workflows in their package
3. **Local Development**: Edit JSON files with hot-reload
4. **Database-Free**: Run without PostgreSQL for simple setups
5. **CI/CD**: Deploy workflows from repository as code

### Example: MCP with Bundled Workflows

An MCP package can include workflows that are automatically available:

```
my-mcp/
├── package.json
├── src/
│   └── index.ts
└── workflows/
    ├── enrich.json
    └── notify.json
```

Start with: `WORKFLOW_DIR=./workflows bun run src/index.ts`

---

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

The stdio transport supports Mesh bindings via TWO mechanisms:

### 1. Environment Variables (Primary for STDIO)

Mesh passes bindings to stdio processes via environment variables:

| Variable | Description |
|----------|-------------|
| `MESH_URL` | Base URL of the Mesh instance (e.g., `https://mesh.example.com`) |
| `MESH_TOKEN` | JWT token for authenticating with Mesh API |
| `MESH_STATE` | JSON with binding connection IDs |

The `MESH_STATE` format:
```json
{
  "DATABASE": { "__type": "@deco/postgres", "value": "connection-id" },
  "EVENT_BUS": { "__type": "@deco/event-bus", "value": "connection-id" },
  "CONNECTION": { "__type": "@deco/connection", "value": "connection-id" }
}
```

When these env vars are set, the server:
1. Parses bindings at startup
2. Runs database migrations automatically
3. Uses Mesh's proxy API to execute database operations

### 2. MCP Tools (Dynamic Configuration)

- `MCP_CONFIGURATION` - Returns the state schema for the bindings UI (uses `BindingOf` format)
- `ON_MCP_CONFIGURATION` - Receives configured bindings dynamically (used for UI-based configuration)

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
| `MESH_URL` | Yes* | Base URL of the Mesh instance |
| `MESH_TOKEN` | Yes* | JWT token for Mesh API authentication |
| `MESH_STATE` | Yes* | JSON with binding connection IDs |
| `WORKFLOW_DIR` | No | Directory to scan for workflow JSON files (recursive) |
| `WORKFLOW_FILES` | No | Comma-separated list of specific workflow JSON file paths |

*Required for database operations. Mesh passes these automatically when spawning stdio connections.

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
