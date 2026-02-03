# Task Runner MCP

Orchestrate AI agents through task lists with **Beads** integration and **Ralph-style** execution loops.

## Features

- **Beads Integration**: Full wrapper around the `bd` CLI for task management
- **Ralph Loop Engine**: Automated task execution with completion detection
- **Skills System**: Reusable workflows for common development tasks
- **Budget Control**: Limit agent execution by iterations or tokens

## Installation

The Task Runner MCP is part of the `mcps` workspace. Install from the root:

```bash
cd /path/to/mcps
bun install
```

### Prerequisites

1. **Beads CLI**: Install the `bd` command:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash
   ```

2. **Claude CLI** (for agent execution):
   ```bash
   # Install Anthropic's Claude CLI
   npm install -g @anthropic-ai/claude-cli
   ```

## Development

```bash
# From the task-runner directory
cd mcps/task-runner

# Type check
bun run check

# Run dev server
bun run dev
```

## Tools

### Workspace Management

| Tool | Description |
|------|-------------|
| `WORKSPACE_SET` | Set the working directory for all operations |
| `WORKSPACE_GET` | Get the current workspace |

### Beads Integration

| Tool | Description |
|------|-------------|
| `BEADS_INIT` | Initialize Beads in workspace (`bd init`) |
| `BEADS_READY` | Get tasks ready to work on (`bd ready`) |
| `BEADS_CREATE` | Create a new task (`bd create`) |
| `BEADS_UPDATE` | Update task status/details (`bd update`) |
| `BEADS_CLOSE` | Close completed tasks (`bd close`) |
| `BEADS_SYNC` | Sync with git (`bd sync`) |
| `BEADS_LIST` | List all tasks (`bd list`) |
| `BEADS_SHOW` | Show task details (`bd show`) |

### Ralph Loop Engine

| Tool | Description |
|------|-------------|
| `LOOP_START` | Start automated task execution |
| `LOOP_STATUS` | Get current loop status |
| `LOOP_PAUSE` | Pause after current task |
| `LOOP_STOP` | Stop and reset the loop |

### Skills

| Tool | Description |
|------|-------------|
| `SKILL_LIST` | List available skills |
| `SKILL_SHOW` | Show skill details |
| `SKILL_APPLY` | Apply skill to create tasks |

## Skills

Skills define reusable workflows. Currently available:

- **build-mcp**: Create a new MCP server with tools

### Using Skills

```bash
# 1. Set workspace
WORKSPACE_SET { directory: "/path/to/project" }

# 2. Apply a skill (creates Beads tasks)
SKILL_APPLY { skillId: "build-mcp" }

# 3. Start the loop
LOOP_START { maxIterations: 10 }
```

## Ralph Loop Flow

```
SELECT → PROMPT → EXECUTE → EVALUATE → (repeat)
   ↓        ↓         ↓          ↓
Get ready  Build    Call     Check for
tasks     prompt   Claude   <promise>COMPLETE</promise>
from bd            CLI      Run quality gates
```

The loop continues until:
- All tasks completed
- Max iterations reached
- Token budget exhausted
- Manual pause/stop

## Quality Gates

After each task completion, quality gates are run:

```javascript
qualityGates: ["bun run check"]
```

If gates fail, the task remains open for retry.

## License

MIT
