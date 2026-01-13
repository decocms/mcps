# Pilot Architecture

## Overview

Pilot is an **event-driven AI agent** that handles messages via the MCP Mesh event bus. It subscribes to user events, processes them with LLM + tool calling, and publishes response events back.

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
│  │                                                                     │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│                                                                            │
│  ┌─────────────────────┐    ┌─────────────────────┐    ┌──────────────┐   │
│  │       Pilot         │    │    mesh-bridge      │    │ Other MCPs   │   │
│  │                     │    │                     │    │              │   │
│  │  Subscribes to:     │    │  Publishes:         │    │ • OpenRouter │   │
│  │  user.message.*     │    │  user.message.*     │    │ • Perplexity │   │
│  │                     │    │                     │    │ • MCP Studio │   │
│  │  Publishes:         │    │  Subscribes to:     │    │              │   │
│  │  agent.response.*   │    │  agent.response.*   │    │              │   │
│  │  agent.task.*       │    │                     │    │              │   │
│  └─────────────────────┘    └─────────────────────┘    └──────────────┘   │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

## Design Principles

### 1. Simple Message Loop

Every message follows this flow:
1. Receive `user.message.received` event
2. Get/create thread for conversation continuity
3. Call LLM with available tools
4. Execute tool calls via gateway
5. Loop until final response
6. Publish `agent.response.*` event

### 2. Event-Driven Communication

Pilot never calls interfaces directly. It:
- **Subscribes** to `user.message.received` events
- **Publishes** `agent.response.*` events for each interface
- **Publishes** progress events during execution

### 3. Thread-Based Conversations

Threads are stored as JSON files in `~/.deco/pilot/threads/`. Each thread:
- Has a 5-minute TTL (configurable)
- Continues if messages arrive within TTL
- Can be closed with `/new` command

## File Structure

```
pilot/
├── server/
│   ├── main.ts              # MCP server entry (~1100 lines)
│   ├── events.ts            # Event type definitions
│   ├── thread-manager.ts    # File-based conversation threads
│   ├── types/
│   │   └── workflow.ts      # Workflow type definitions
│   └── tools/
│       ├── index.ts         # Tool exports
│       ├── system.ts        # File/shell/clipboard tools
│       └── speech.ts        # Text-to-speech tools
├── workflows/               # JSON workflow definitions
├── docs/
│   └── ARCHITECTURE.md
├── env.example
└── README.md
```

## Core Components

### main.ts

The main server file contains:
- Configuration parsing from env vars
- Mesh API helpers (`callMeshTool`, `callLLM`, `callAgentTool`)
- Event publishing/subscribing
- Tool cache management
- `handleMessage()` - the core message processing loop
- MCP tool registrations

### thread-manager.ts

Manages conversation state:
- `getOrCreateThread()` - get existing or create new thread
- `addMessage()` - add user/assistant messages
- `closeAllThreadsForSource()` - handle `/new` command
- `buildMessageHistory()` - build LLM context

### events.ts

Defines CloudEvent types:
- `UserMessageEventSchema` - incoming messages
- `TaskProgressEventSchema` - progress updates
- `AgentResponseEventSchema` - outgoing responses

## MCP Tools

| Tool | Description |
|------|-------------|
| `MCP_CONFIGURATION` | Returns binding schema for Mesh UI |
| `ON_MCP_CONFIGURATION` | Receives configuration from Mesh |
| `WORKFLOW_START` | Start a workflow via MCP Studio |
| `MESSAGE` | Handle a message with thread continuation |
| `NEW_THREAD` | Start a fresh conversation |
| `ON_EVENTS` | Receive CloudEvents from mesh |

## Event Types

### Subscribed (Incoming)

```typescript
"user.message.received" {
  text: string;
  source: string;    // whatsapp, cli, etc.
  chatId?: string;
  sender?: { name?: string };
}
```

### Published (Outgoing)

```typescript
"agent.response.{source}" {
  text: string;
  chatId?: string;
  isFinal: boolean;
}

"agent.task.progress" {
  taskId: string;
  source: string;
  message: string;
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

# Thread settings
THREAD_TTL_MS=300000  # 5 minutes
```

## Bindings

Pilot requires these bindings configured in Mesh:

| Binding | Type | Description |
|---------|------|-------------|
| LLM | `@deco/openrouter` | LLM for AI responses |
| AGENT | `@deco/agent` | Gateway for tool access |
| EVENT_BUS | `@deco/event-bus` | Event bus for pub/sub |

## Message Flow

```
1. mesh-bridge receives WhatsApp message
   ↓
2. Publishes user.message.received
   ↓
3. Pilot receives via ON_EVENTS
   ↓
4. handleMessage():
   a. Get/create thread
   b. Call LLM with tools
   c. Execute tool calls via gateway
   d. Repeat until response ready
   ↓
5. Pilot publishes agent.response.whatsapp
   ↓
6. mesh-bridge receives, sends to WhatsApp
```

## Local Tools

Pilot includes local system tools:
- `LIST_FILES` - List directory contents
- `READ_FILE` - Read file contents
- `RUN_SHELL` - Execute shell commands
- `LIST_APPS` - List running applications
- `GET_CLIPBOARD` / `SET_CLIPBOARD` - Clipboard access
- `SEND_NOTIFICATION` - System notifications
- `SAY_TEXT` - Text-to-speech
- `STOP_SPEAKING` - Stop TTS
