# Pilot Architecture

## Overview

Pilot is an **event-driven workflow executor**. It subscribes to user events from the Event Bus, executes configurable workflows, and publishes response events back. It serves as the AI "brain" that processes requests from interfaces like Mesh Bridge.

```
┌───────────────────────────────────────────────────────────────────────────┐
│                              MCP MESH                                      │
│                                                                            │
│  ┌────────────────────────────────────────────────────────────────────┐   │
│  │                         EVENT BUS                                   │   │
│  │                                                                     │   │
│  │    user.message.received ───────► Pilot subscribes                 │   │
│  │    agent.response.* ◄───────────  Pilot publishes                  │   │
│  │    agent.task.progress ◄────────  Pilot publishes                  │   │
│  │    agent.task.completed ◄───────  Pilot publishes                  │   │
│  │                                                                     │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│                                                                            │
│  ┌─────────────────────┐    ┌─────────────────────┐    ┌──────────────┐   │
│  │       Pilot         │    │    mesh-bridge      │    │ Other MCPs   │   │
│  │                     │    │                     │    │              │   │
│  │  Subscribes to:     │    │  Publishes:         │    │ • OpenRouter │   │
│  │  user.message.*     │    │  user.message.*     │    │ • Perplexity │   │
│  │                     │    │                     │    │ • Writing    │   │
│  │  Publishes:         │    │  Subscribes to:     │    │ • Your MCPs  │   │
│  │  agent.response.*   │    │  agent.response.*   │    │              │   │
│  │  agent.task.*       │    │                     │    │              │   │
│  │                     │    │                     │    │              │   │
│  │  Workflows:         │    │  Domains:           │    │              │   │
│  │  • fast-router      │    │  • WhatsApp         │    │              │   │
│  │  • conversation     │    │  • (more)           │    │              │   │
│  │  • custom...        │    │                     │    │              │   │
│  └─────────────────────┘    └─────────────────────┘    └──────────────┘   │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

## Design Principles

### 1. Workflow-Driven Execution

Every request is processed by a **workflow**—a JSON file that defines execution steps. Workflows are:
- **Declarative**: Define what to do, not how
- **Composable**: Steps can call other workflows
- **Configurable**: Store in `workflows/` or custom directory

```json
{
  "id": "fast-router",
  "title": "Fast Router",
  "steps": [
    {
      "name": "route",
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

### 2. Event-Driven Communication

Pilot never calls interfaces directly. It:
- **Subscribes** to `user.message.received` events
- **Publishes** `agent.response.*` events for each interface
- **Publishes** progress and completion events

This decouples the agent from specific interfaces.

### 3. MCP Tasks Protocol

Pilot implements the [MCP Tasks specification](https://modelcontextprotocol.io/specification/draft/basic/utilities/tasks):
- Tasks are persisted to disk as JSON
- Status: `working`, `completed`, `failed`, `cancelled`
- Full execution trace for debugging

## Components

### Main Entry Point (`server/main.ts`)

| Section | Purpose |
|---------|---------|
| Configuration | Parse env vars, validate workflows |
| Bindings | LLM, CONNECTION, EVENT_BUS from mesh |
| Mesh API | `callMeshTool`, `callLLM`, `publishEvent` |
| Workflow Execution | `startWorkflow`, `handleConversationMessage` |
| MCP Tools | All registered tools |

### Workflow Executor (`server/core/workflow-executor.ts`)

The engine that runs workflows step-by-step:

```typescript
await executeWorkflow("fast-router", {
  message: "Hello",
  history: []
}, {
  callLLM,           // LLM callback
  callMeshTool,      // Tool execution
  listConnections,   // Discover tools
  publishEvent,      // Progress updates
});
```

**Step Types:**
- `llm`: Call LLM with prompt, tools, system prompt
- `tool`: Call a specific MCP tool
- `code`: Run TypeScript transform (future)

### Task Storage (`server/core/task-storage.ts`)

Persists tasks to `TASKS_DIR` as JSON files:

```typescript
interface Task {
  taskId: string;
  status: "working" | "completed" | "failed" | "cancelled";
  workflowId: string;
  workflowInput: Record<string, unknown>;
  stepResults: StepResult[];
  result?: unknown;
  error?: string;
  createdAt: string;
  lastUpdatedAt: string;
}
```

### Conversation Manager (`server/core/conversation-manager.ts`)

Manages long-running conversation threads:
- Tracks active conversations by `source + chatId`
- Routes follow-up messages to same conversation
- Auto-expires after timeout

## Event Flow

### Request → Response

```
1. Interface sends message (e.g., WhatsApp via Bridge)
   ↓
2. Bridge publishes to Event Bus
   EVENT_PUBLISH("user.message.received", { text, source: "whatsapp", chatId })
   ↓
3. Pilot receives via ON_EVENTS tool
   ↓
4. Pilot routes to workflow (fast-router by default)
   ↓
5. Workflow executes:
   a. LLM analyzes request
   b. LLM calls tools if needed (via mesh)
   c. LLM generates response
   ↓
6. Pilot publishes response event
   EVENT_PUBLISH("agent.response.whatsapp", { text, taskId, isFinal: true })
   ↓
7. Bridge receives via ON_EVENTS
   ↓
8. Bridge sends to extension → appears in WhatsApp
```

### Progress Updates

During execution, Pilot publishes progress events:

```typescript
await publishEvent("agent.task.progress", {
  taskId: "task-123",
  source: "whatsapp",
  chatId: "self",
  message: "🔍 Searching the web..."
});
```

Interfaces can display these to users.

## Event Types

### Subscribed (Incoming)

```typescript
"user.message.received" {
  text: string;           // Message content
  source: string;         // Interface (whatsapp, cli, etc.)
  chatId?: string;        // Conversation ID
  sender?: { name?: string };
  metadata?: Record<string, unknown>;
}
```

### Published (Outgoing)

```typescript
"agent.response.{source}" {
  taskId: string;
  chatId?: string;
  text: string;
  imageUrl?: string;
  isFinal: boolean;
}

"agent.task.progress" {
  taskId: string;
  source: string;
  chatId?: string;
  message: string;
  percent?: number;
}

"agent.task.completed" {
  taskId: string;
  source: string;
  chatId?: string;
  response: string;
  duration: number;
  toolsUsed: string[];
}

"agent.task.failed" {
  taskId: string;
  source: string;
  chatId?: string;
  error: string;
  canRetry: boolean;
}
```

## MCP Tools

### Workflow Execution

| Tool | Description |
|------|-------------|
| `WORKFLOW_START` | Start a workflow synchronously |
| `MESSAGE` | Smart routing: conversation or command mode |
| `CONVERSATION_START` | Start long-running conversation |
| `CONVERSATION_END` | End active conversation |

### Task Management

| Tool | Description |
|------|-------------|
| `TASK_GET` | Get task status |
| `TASK_RESULT` | Get completed task result |
| `TASK_LIST` | List tasks with filtering |
| `TASK_CANCEL` | Cancel running task |
| `TASK_STATS` | Get task statistics |

### Workflow Management

| Tool | Description |
|------|-------------|
| `WORKFLOW_LIST` | List all workflows |
| `WORKFLOW_GET` | Get workflow by ID |
| `WORKFLOW_CREATE` | Create new workflow |

### Events

| Tool | Description |
|------|-------------|
| `ON_EVENTS` | Receive events from mesh (called by Event Bus) |

## Built-in Workflows

| ID | Description |
|----|-------------|
| `fast-router` | Routes to direct response, tool call, or async workflow |
| `conversation` | Long-running conversation with memory |
| `direct-execution` | Execute with all tools, no routing |
| `execute-multi-step` | Multi-step complex task execution |
| `research-first` | Read context file before responding |

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
```

## File Structure

```
pilot/
├── server/
│   ├── main.ts              # MCP server entry
│   ├── events.ts            # Event type definitions
│   ├── core/
│   │   ├── workflow-executor.ts  # Step-by-step execution
│   │   ├── workflow-storage.ts   # Load/save workflows
│   │   ├── task-storage.ts       # Persist tasks
│   │   └── conversation-manager.ts
│   ├── types/
│   │   ├── task.ts           # MCP Task schema
│   │   └── workflow.ts       # Workflow/Step types
│   └── tools/                # Local tools (speech, system)
├── workflows/                # Built-in workflows
│   ├── fast-router.json
│   ├── conversation.json
│   └── ...
├── env.example
└── README.md
```

## Creating Custom Workflows

1. **Create JSON file** in `CUSTOM_WORKFLOWS_DIR` or `workflows/`:

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
        "tools": ["perplexity_search", "COLLECTION_ARTICLES_CREATE"]
      }
    }
  ]
}
```

2. **Use `@ref` syntax** for dynamic values:
   - `@input.message` - Workflow input
   - `@step_1.output` - Previous step output
   - `@config.fastModel` - Configuration value

3. **Trigger via events** or tools:
   - Configure `EVENT_WORKFLOW_MAP=event.type:workflow-id`
   - Or call `WORKFLOW_START` directly

