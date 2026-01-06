# Blog Post Draft: Introducing Pilot

> Technical blog post structure for announcing Pilot. Focus on workflow-driven AI, event-based communication, and composable task execution.

---

## Title Options

1. "Pilot: A Workflow-Driven AI Agent for the MCP Ecosystem"
2. "From Events to Intelligence: Building an AI Agent with MCP Workflows"
3. "How We Built an AI Agent That Any Interface Can Use"

---

## Hook (150 words)

The problem with AI agents isn't intelligence—it's integration.

Every new interface (WhatsApp, Slack, CLI, Raycast) needs its own agent implementation. Every agent duplicates the same tool-calling logic. Every update requires changes in multiple places.

We built Pilot to solve this. It's a single AI agent that:
- Subscribes to events from any interface
- Executes configurable workflows
- Publishes responses back via events

The key insight: **separate the AI brain from the interface layer**. Let specialized bridges handle DOM/UI, and let a central agent handle intelligence.

Pilot runs as an MCP inside your mesh. It has access to all your tools. It persists task history. And any interface can use it just by publishing events.

---

## Section 1: The Problem (300 words)

### The Interface Fragmentation Problem

When you want AI in WhatsApp, you build an AI integration for WhatsApp.
When you want AI in Slack, you build another one for Slack.
When you want AI in your CLI, another one.

Each integration:
- Implements its own LLM-calling logic
- Manages its own conversation state
- Has its own tool definitions
- Needs its own updates when things change

This doesn't scale.

### What If the AI Was a Service?

Imagine instead:
1. Interfaces just publish events: "user said X"
2. A central agent receives all events
3. Agent processes with full tool access
4. Agent publishes response events
5. Interfaces receive and display

```
WhatsApp Bridge ─┐
                 ├──► Event Bus ──► Pilot Agent ──► Event Bus ──┬──► WhatsApp Bridge
Slack Bot ───────┤                                              ├──► Slack Bot
CLI ─────────────┘                                              └──► CLI
```

Now you have:
- One agent to update
- One place for tools
- One source of truth for AI behavior
- N interfaces that just handle their specific UI

---

## Section 2: How Pilot Works (400 words)

### Event-Driven Architecture

Pilot never knows about WhatsApp or Slack directly. It subscribes to generic events:

```typescript
// Pilot subscribes to this event type
"user.message.received" {
  text: "What's the weather?",
  source: "whatsapp",     // Just metadata
  chatId: "self"
}
```

And publishes generic response events:

```typescript
// Pilot publishes to agent.response.{source}
"agent.response.whatsapp" {
  taskId: "task-123",
  text: "It's 72°F and sunny!",
  isFinal: true
}
```

The `source` field determines which interface receives the response. That's the only coupling.

### Workflow Execution

Every request is processed by a **workflow**—a JSON configuration that defines execution steps:

```json
{
  "id": "fast-router",
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

Workflows are:
- **Declarative**: Describe what, not how
- **Composable**: One workflow can trigger another
- **Hot-reloadable**: Change JSON, behavior changes

### The Fast Router Pattern

The default workflow (`fast-router`) implements a smart routing pattern:

1. **Direct Response**: For simple queries (greetings, questions)
2. **Single Tool Call**: For specific operations (search, file read)
3. **Async Workflow**: For complex multi-step tasks

```
"Hello!" → Direct response (no tools)
"Search for X" → Single perplexity_search call
"Write a blog post" → Start async workflow, return immediately
```

This keeps simple requests fast while handling complex tasks properly.

### Task Management

Every workflow execution creates a **Task** (MCP Tasks protocol):

```typescript
interface Task {
  taskId: string;
  status: "working" | "completed" | "failed";
  workflowId: string;
  stepResults: StepResult[];  // Full execution trace
  result?: unknown;
  createdAt: string;
}
```

Tasks are persisted to disk. You can:
- Check status (`TASK_GET`)
- Get results (`TASK_RESULT`)
- List all tasks (`TASK_LIST`)
- Cancel running tasks (`TASK_CANCEL`)

---

## Section 3: Tool Access (300 words)

### Full Mesh Integration

Pilot runs inside MCP Mesh and has access to all connected tools:

```
Pilot connects to:
├── OpenRouter (LLM)
├── Perplexity (web search)
├── Writing MCP (blog tools)
├── Local FS (file operations)
├── Your custom MCPs...
└── Any tool in your mesh
```

The `fast-router` workflow uses `tools: "all"` to give the LLM access to everything:

```json
{
  "action": {
    "type": "llm",
    "tools": "all"  // All mesh tools available
  }
}
```

Or you can restrict to specific tools:

```json
{
  "action": {
    "type": "llm",
    "tools": ["perplexity_search", "COLLECTION_ARTICLES_CREATE"]
  }
}
```

### Tool Discovery

Pilot automatically discovers available tools from the mesh:

```typescript
const connections = await listConnections();
// Returns all connections with their tools

for (const conn of connections) {
  console.log(conn.title, conn.tools.length);
}
// OpenRouter: 3 tools
// Perplexity: 4 tools
// Writing: 15 tools
// ...
```

The LLM sees a unified tool list across all MCPs.

---

## Section 4: Progress & Real-Time Updates (200 words)

### Progress Events

During execution, Pilot publishes progress events:

```typescript
await publishEvent("agent.task.progress", {
  taskId: "task-123",
  source: "whatsapp",
  chatId: "self",
  message: "🔍 Searching the web..."
});
```

Interfaces can display these to users:
- WhatsApp Bridge shows progress messages in chat
- CLI could show a spinner
- Web UI could show a progress bar

### Completion Events

When done, Pilot publishes completion:

```typescript
await publishEvent("agent.task.completed", {
  taskId: "task-123",
  source: "whatsapp",
  chatId: "self",
  response: "Here's what I found...",
  duration: 3420,
  toolsUsed: ["perplexity_search", "COLLECTION_ARTICLES_CREATE"]
});
```

This includes:
- The final response
- How long it took
- Which tools were used
- Whether it can be retried (on failure)

---

## Section 5: Conversations (200 words)

### Long-Running Conversations

Sometimes you want back-and-forth dialogue, not just command-response.

Pilot supports **conversation mode**:

```typescript
// Start a conversation
await CONVERSATION_START({ text: "Let's brainstorm ideas" });

// Follow-up messages automatically route to same conversation
await MESSAGE({ text: "What about marketing?" });

// End explicitly or via timeout
await CONVERSATION_END();
```

Conversations:
- Maintain message history
- Route by `source + chatId`
- Auto-expire after configurable timeout

### Conversation Workflow

The `conversation` workflow handles this:

```json
{
  "id": "conversation",
  "steps": [
    {
      "name": "respond",
      "action": {
        "type": "llm",
        "prompt": "@input.message",
        "model": "fast",
        "tools": "all",
        "systemPrompt": "You are in a conversation. Use history for context."
      },
      "input": {
        "message": "@input.message",
        "history": "@input.history"
      }
    }
  ]
}
```

---

## Section 6: Demo Walkthrough (200 words)

### What to Show

1. **Setup** (30 sec)
   - Show Mesh with Pilot connection
   - Show Pilot logs showing subscription

2. **Simple Query** (30 sec)
   - Send "Hello" via WhatsApp
   - Show instant direct response
   - Show task created and completed

3. **Tool Usage** (60 sec)
   - Send "Search for MCP news"
   - Show Pilot calling Perplexity
   - Show response in WhatsApp

4. **Complex Task** (90 sec)
   - Send "Write a draft about Pilot and publish"
   - Show workflow starting async
   - Show progress events in chat
   - Show article created in blog

5. **Task Management** (30 sec)
   - Show `TASK_LIST` output
   - Show task JSON with full execution trace

### Key Talking Points

- "One agent serves all interfaces"
- "Workflows are JSON—change behavior without code"
- "Full mesh tool access"
- "Progress updates in real-time"
- "Task history for debugging"

---

## Section 7: Creating Custom Workflows (200 words)

### The Pattern

Create a JSON file in your workflows directory:

```json
{
  "id": "research-and-write",
  "title": "Research and Write",
  "steps": [
    {
      "name": "research",
      "action": {
        "type": "llm",
        "prompt": "Research this topic: @input.topic",
        "model": "fast",
        "tools": ["perplexity_search"]
      }
    },
    {
      "name": "write",
      "action": {
        "type": "llm",
        "prompt": "Write an article based on this research: @research.output",
        "model": "smart",
        "tools": ["COLLECTION_ARTICLES_CREATE"]
      }
    }
  ]
}
```

### Reference Syntax

- `@input.topic` - Workflow input
- `@research.output` - Previous step output
- `@config.smartModel` - Configuration value

### Triggering

Via event mapping:
```bash
EVENT_WORKFLOW_MAP=custom.research:research-and-write
```

Or directly:
```typescript
await WORKFLOW_START({
  workflowId: "research-and-write",
  input: { topic: "AI agents" }
});
```

---

## Closing (100 words)

AI agents shouldn't be tied to interfaces. They should be services that any interface can use.

Pilot implements this pattern:
- Events in, events out
- Workflows define behavior
- Full mesh tool access
- Persistent task tracking

It runs locally, uses your keys, and connects to your entire MCP ecosystem.

We're using it with WhatsApp today. Tomorrow: Slack, Raycast, CLI, and whatever else we build. One agent, many interfaces.

The future of AI isn't siloed bots—it's composable intelligence.

---

## Links

- **GitHub**: [decolabs/mcps/pilot](https://github.com/decolabs/mcps/tree/main/pilot)
- **MCP Mesh**: [decolabs/mesh](https://github.com/decolabs/mesh)
- **Mesh Bridge**: [decolabs/mesh-bridge](https://github.com/decolabs/mesh-bridge)
- **Event Bus Docs**: [mesh.dev/docs/event-bus](https://mesh.dev/docs/event-bus)


