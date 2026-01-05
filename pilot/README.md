# Pilot

**Workflow-driven AI agent for MCP Mesh.**

Pilot is a local AI agent that executes configurable workflows. It subscribes to events from any interface, processes them with full mesh tool access, and publishes responses back. One agent, many interfaces.

```
┌───────────────────────────────────────────────────────────────────┐
│                          MCP MESH                                  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │                      EVENT BUS                            │     │
│  │                                                           │     │
│  │   user.message.received ──────► Pilot subscribes          │     │
│  │   agent.response.* ◄──────────  Pilot publishes           │     │
│  │   agent.task.progress ◄───────  Pilot publishes           │     │
│  │                                                           │     │
│  └──────────────────────────────────────────────────────────┘     │
│                              ▲                                     │
│                              │                                     │
│  ┌─────────────┐    ┌───────┴───────┐    ┌─────────────────┐      │
│  │   Pilot     │    │ mesh-bridge   │    │   Other MCPs    │      │
│  │             │    │               │    │                 │      │
│  │  Workflows  │◄───│  WhatsApp     │    │  • OpenRouter   │      │
│  │  Tasks      │    │  LinkedIn     │    │  • Perplexity   │      │
│  │  Events     │    │  Any site...  │    │  • Your tools   │      │
│  └─────────────┘    └───────────────┘    └─────────────────┘      │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

## How It Works

1. **Interface** publishes `user.message.received` event
2. **Pilot** receives via `ON_EVENTS` tool
3. **Pilot** executes workflow (fast-router by default)
4. **Workflow** calls LLM with full tool access
5. **Pilot** publishes `agent.response.{source}` event
6. **Interface** receives and displays response

## Recent Updates

### Thread Management

Messages within 5 minutes are treated as the same "thread" (conversation). This enables:

- **Workflow chaining**: "draft this" after research continues the flow
- **Natural follow-ups**: "yes", "continue", "go ahead" proceed to next step
- **Fresh starts**: "new thread", "nova conversa" clears context

### Improved Tool Routing

The fast-router now explicitly guides LLMs to use the correct local tools:

| Use This | NOT This |
|----------|----------|
| `list_tasks` | `TASK_LIST`, `task_list` |
| `list_workflows` | `COLLECTION_WORKFLOW_LIST` |
| `start_task` | `WORKFLOW_START`, `TASK_CREATE` |

This prevents confusion when 192+ tools are available.

## Quick Start

### 1. Configure

```bash
cp env.example .env
# Edit .env with your MESH_TOKEN
```

### 2. CLI Mode (Interactive Terminal)

For a quick interactive session without mesh-bridge:

```bash
MESH_TOKEN=your-token bun run cli
```

This opens a Codex/Claude Code-like terminal interface where you can chat with Pilot directly.

```
╔════════════════════════════════════════════════════════════╗
║   🚀 PILOT CLI                                             ║
║   Interactive AI Agent for MCP Mesh                        ║
╚════════════════════════════════════════════════════════════╝

you ❯ what time is it?
pilot ❯ The current time is 3:45 PM on January 5, 2026.

you ❯ /help
Commands:
  /help   - Show help
  /new    - Start new conversation
  /status - Show connection status
  /quit   - Exit
```

### 3. Add to Mesh

In MCP Mesh, add Pilot as a **Custom Command** connection:

| Field | Value |
|-------|-------|
| Name | `Pilot` |
| Type | `Custom Command` |
| Command | `bun` |
| Arguments | `run`, `start` |
| Working Directory | `/path/to/mcps/pilot` |

### 3. Configure Bindings

Pilot requires these bindings:
- **LLM**: OpenRouter or compatible (for AI responses)
- **CONNECTION**: Access to mesh connections (for tool discovery)
- **EVENT_BUS**: For pub/sub (optional but recommended)

### 4. Test

Send a message via any connected interface (WhatsApp, CLI, etc.) and watch Pilot process it.

## Workflows

Every request is processed by a **workflow**—a JSON file defining execution steps.

### Built-in Workflows

| ID | Description |
|----|-------------|
| `fast-router` | Routes to direct response, tool call, or async task |
| `conversation` | Long-running conversation with memory |
| `direct-execution` | Execute with all tools, no routing |
| `execute-multi-step` | Complex multi-step tasks |
| `research-first` | Read context before responding |

### Creating Custom Workflows

Create a JSON file in `workflows/` or `CUSTOM_WORKFLOWS_DIR`:

```json
{
  "id": "my-workflow",
  "title": "My Custom Workflow",
  "steps": [
    {
      "name": "process",
      "action": {
        "type": "llm",
        "prompt": "@input.message",
        "model": "fast",
        "tools": "all"
      }
    }
  ]
}
```

### Step Actions

| Type | Description |
|------|-------------|
| `llm` | Call LLM with prompt, tools, system prompt |
| `tool` | Call a specific MCP tool |
| `code` | Run TypeScript transform (future) |

### Reference Syntax

- `@input.message` - Workflow input
- `@step_name.output` - Previous step output
- `@config.fastModel` - Configuration value

## MCP Tools

### Execution

| Tool | Description |
|------|-------------|
| `WORKFLOW_START` | Start workflow synchronously |
| `MESSAGE` | Smart routing (conversation or command) |
| `CONVERSATION_START` | Start long-running conversation |
| `CONVERSATION_END` | End active conversation |

### Task Management

| Tool | Description |
|------|-------------|
| `TASK_GET` | Get task status |
| `TASK_RESULT` | Get completed task result |
| `TASK_LIST` | List tasks with filtering |
| `TASK_CANCEL` | Cancel running task |
| `TASK_STATS` | Get statistics |

### Workflows

| Tool | Description |
|------|-------------|
| `WORKFLOW_LIST` | List all workflows |
| `WORKFLOW_GET` | Get workflow by ID |
| `WORKFLOW_CREATE` | Create new workflow |

### Events

| Tool | Description |
|------|-------------|
| `ON_EVENTS` | Receive events from mesh |

## Event Types

### Subscribed (Incoming)

```typescript
"user.message.received" {
  text: string;
  source: string;     // whatsapp, cli, etc.
  chatId?: string;
  sender?: { name?: string };
}
```

### Published (Outgoing)

```typescript
"agent.response.{source}" {
  taskId: string;
  text: string;
  isFinal: boolean;
}

"agent.task.progress" {
  taskId: string;
  message: string;
}

"agent.task.completed" {
  taskId: string;
  response: string;
  duration: number;
  toolsUsed: string[];
}
```

## Configuration

```bash
# Mesh connection
MESH_URL=http://localhost:3000
MESH_TOKEN=...

# AI models
FAST_MODEL=google/gemini-2.5-flash
SMART_MODEL=anthropic/claude-sonnet-4

# Storage
TASKS_DIR=~/Projects/tasks
CUSTOM_WORKFLOWS_DIR=~/Projects/workflows

# Defaults
DEFAULT_WORKFLOW=fast-router
CONVERSATION_WORKFLOW=conversation
CONVERSATION_TIMEOUT_MS=300000

# Event mapping (optional)
EVENT_WORKFLOW_MAP=custom.event:my-workflow
```

## File Structure

```
pilot/
├── server/
│   ├── main.ts              # MCP server
│   ├── events.ts            # Event types
│   ├── core/
│   │   ├── workflow-executor.ts
│   │   ├── workflow-storage.ts
│   │   ├── task-storage.ts
│   │   └── conversation-manager.ts
│   └── types/
│       ├── task.ts
│       └── workflow.ts
├── cli/
│   ├── index.ts             # Interactive CLI entry point
│   └── mesh-client.ts       # Mesh connection for CLI
├── workflows/               # Built-in workflows
│   ├── fast-router.json
│   ├── conversation.json
│   └── ...
├── docs/
│   └── ARCHITECTURE.md
├── env.example
└── README.md
```

## Development

```bash
# Install dependencies
bun install

# Run MCP server with hot reload
bun run dev

# Run CLI with hot reload
bun run cli:dev

# Run CLI (production)
bun run cli

# Run tests
bun test

# Type check
bun run check
```

## See Also

- [Architecture](docs/ARCHITECTURE.md) - Detailed architecture overview
- [Mesh Bridge](../../mesh-bridge) - Browser interface for Pilot
- [MCP Mesh](https://github.com/decolabs/mesh) - The mesh platform

## License

MIT
