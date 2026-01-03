# Pilot MCP

**Workflow-based AI agent for the MCP Mesh**

Pilot is a local AI agent that orchestrates tasks using configurable workflows. It implements the [MCP Tasks specification](https://modelcontextprotocol.io/specification/draft/basic/utilities/tasks) and supports both command mode (single-shot task execution) and conversation mode (long-running threads).

## Quick Start

```bash
# Copy env.example and configure
cp env.example .env

# Edit .env with your settings
# At minimum, set MESH_TOKEN

# Start the server
bun run start
```

## Configuration

Copy `env.example` to `.env` and configure:

### Required
- `MESH_TOKEN` - Authentication token for mesh API calls

### Mesh Connection
- `MESH_URL` - URL of the MCP Mesh server (default: `http://localhost:3000`)

### AI Models
- `FAST_MODEL` - Model for quick routing/planning (default: `google/gemini-2.5-flash`)
- `SMART_MODEL` - Model for execution (default: same as FAST_MODEL)

### Storage Paths
- `TASKS_DIR` - Directory for task JSON files (default: `~/Projects/tasks`)
- `CUSTOM_WORKFLOWS_DIR` - Directory for custom workflows (optional, takes precedence over built-in)

### Workflow Configuration
- `DEFAULT_WORKFLOW` - Workflow for command mode (default: `default-agent-loop`)
- `CONVERSATION_WORKFLOW` - Workflow for conversations (default: `conversation`)

### Conversation Mode
- `CONVERSATION_TIMEOUT_MS` - Timeout for conversations (default: `300000` = 5 minutes)
- `CONVERSATION_DEFAULT_MODEL` - Model for conversations: `fast` or `smart` (default: `fast`)

### Event Mapping
- `EVENT_WORKFLOW_MAP` - Map event types to workflows (format: `event.type:workflow-id,another:other`)

## Concepts

### Workflows

Workflows are JSON files that define reusable execution patterns. Each workflow has:
- **Steps**: Ordered list of actions to execute
- **Input**: Data passed to the workflow with `@ref` syntax for references
- **Actions**: `tool` (MCP tool call), `code` (TypeScript transform), or `llm` (agent call)

Example workflow:
```json
{
  "id": "my-workflow",
  "title": "My Custom Workflow",
  "steps": [
    {
      "name": "step_1",
      "action": {
        "type": "llm",
        "prompt": "@input.message",
        "model": "fast",
        "tools": "all"
      },
      "input": {
        "message": "@input.message"
      }
    }
  ]
}
```

### Command Mode vs Conversation Mode

**Command Mode** (default):
- Single-shot task execution
- Uses `DEFAULT_WORKFLOW` (default: `default-agent-loop`)
- FAST routing → SMART execution

**Conversation Mode**:
- Long-running thread that persists until timeout or explicit end
- Uses `CONVERSATION_WORKFLOW` (default: `conversation`)
- Messages are routed to the active conversation
- Timeout after `CONVERSATION_TIMEOUT_MS` of inactivity

### Tasks

Every workflow execution creates a task:
- Persisted to `TASKS_DIR` as JSON files
- MCP-compliant status: `working`, `completed`, `failed`, `cancelled`
- Step-by-step progress tracking
- Full execution trace for debugging

## MCP Tools

### Execution
| Tool | Description |
|------|-------------|
| `WORKFLOW_START` | Start any workflow with custom input |
| `MESSAGE` | Smart routing: conversation if active, else command mode |
| `CONVERSATION_START` | Start a long-running conversation thread |
| `CONVERSATION_END` | Explicitly end an active conversation |

### Tasks (MCP Tasks Protocol)
| Tool | Description |
|------|-------------|
| `TASK_GET` | Get task status |
| `TASK_RESULT` | Get completed task result |
| `TASK_LIST` | List tasks with optional filtering |
| `TASK_CANCEL` | Cancel a running task |
| `TASK_STATS` | Get task statistics |

### Workflows
| Tool | Description |
|------|-------------|
| `WORKFLOW_LIST` | List all available workflows |
| `WORKFLOW_GET` | Get workflow details by ID |
| `WORKFLOW_CREATE` | Create a new workflow |

### Events
| Tool | Description |
|------|-------------|
| `ON_EVENTS` | Receive CloudEvents from mesh, route to workflows |

## Built-in Workflows

| ID | Description |
|----|-------------|
| `default-agent-loop` | FAST routing → SMART execution (two-phase agent) |
| `direct-execution` | Skip routing, execute directly with all tools |
| `research-first` | Read a context file before responding |
| `conversation` | Long-running conversation with timeout |

## Event Mapping

Map mesh events to specific workflows via `EVENT_WORKFLOW_MAP`:

```bash
EVENT_WORKFLOW_MAP=whatsapp.message:default-agent-loop,slack.command:direct-execution
```

Unmapped events use `DEFAULT_WORKFLOW`.

## File Structure

```
pilot/
├── server/
│   ├── main.ts                    # MCP server
│   ├── types/
│   │   ├── task.ts                # MCP-compliant task schema
│   │   └── workflow.ts            # Workflow/Step types
│   └── core/
│       ├── task-storage.ts        # File-based task persistence
│       ├── workflow-storage.ts    # Workflow persistence
│       ├── workflow-executor.ts   # Step-by-step execution
│       └── conversation-manager.ts # Conversation threads
├── workflows/                     # Built-in workflows
│   ├── default-agent-loop.json
│   ├── direct-execution.json
│   ├── research-first.json
│   └── conversation.json
├── env.example                    # Configuration template
└── README.md
```

## Development

```bash
# Install dependencies
bun install

# Run in development mode
bun run dev

# Build
bun run build

# Check types
bun run check
```

## License

MIT
