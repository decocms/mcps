/**
 * Task Runner Configuration
 *
 * Configuration for the Task Runner MCP, including:
 * - Claude Code agent settings
 * - Allowed/denied tool patterns
 * - Timeout and resource limits
 * - MCP tools available to the agent
 */

// ============================================================================
// MCP Tool Definitions (subset exposed to Claude Code)
// ============================================================================

/**
 * Tools that Claude Code can call via MCP.
 * Each tool has a name, description, and when to use it.
 */
export interface AgentTool {
  name: string;
  description: string;
  when: string;
  required?: boolean; // Should agent use this before completion?
}

/**
 * Tools the agent should have access to for task execution.
 * These are exposed via the task-runner MCP.
 */
export const agentMcpTools: AgentTool[] = [
  // Memory tools - for cross-iteration learning
  {
    name: "MEMORY_READ",
    description: "Read project memory (MEMORY.md + recent daily logs)",
    when: "At session start to load project context",
    required: true,
  },
  {
    name: "MEMORY_WRITE",
    description: "Write discoveries to memory (daily or longterm)",
    when: "When you discover important patterns, decisions, or constraints",
  },
  {
    name: "MEMORY_RECORD_ERROR",
    description: "Record an error pattern and its fix",
    when: "After fixing any non-trivial error - helps future sessions avoid it",
    required: true,
  },
  {
    name: "MEMORY_RECORD_LEARNING",
    description:
      "Record a learning under a category (architecture, patterns, decisions, etc.)",
    when: "When you learn something important about the codebase",
  },
  {
    name: "MEMORY_SEARCH",
    description: "Search memory files for keywords",
    when: "When looking for past decisions or patterns about a specific topic",
  },
  {
    name: "MEMORY_KNOWLEDGE",
    description: "Add LEARNED: entry to knowledge base",
    when: "When you discover a convention, gotcha, or useful insight worth remembering",
  },
  {
    name: "MEMORY_RECALL",
    description: "Search the knowledge base by keyword or tag",
    when: "At session start or when looking for past learnings on a topic",
  },
  {
    name: "TASK_RETRO",
    description: "Run a retrospective after completing a task",
    when: "After completing a significant task - captures what worked and what didn't",
  },

  // Quality gates - for verification
  {
    name: "QUALITY_GATES_LIST",
    description: "List configured quality gates for this project",
    when: "Before starting work to understand success criteria",
  },
  {
    name: "QUALITY_GATES_RUN",
    description: "Run all quality gates and report pass/fail",
    when: "Before outputting completion token - all gates must pass",
    required: true,
  },

  // Task management
  {
    name: "TASK_UPDATE",
    description: "Update task status (open, in_progress, blocked, closed)",
    when: "When task status changes",
  },
  {
    name: "TASK_CREATE",
    description: "Create a follow-up task for remaining work",
    when: "When you identify work that should be done but is out of scope for current task",
  },
  {
    name: "TASK_LIST",
    description: "List all tasks in the project",
    when: "To understand what other work is pending",
  },

  // Session landing
  {
    name: "SESSION_LAND",
    description:
      "Complete the session: run gates, commit, sync, record learnings",
    when: "When task is complete OR when you cannot continue - ALWAYS call before ending",
    required: true,
  },
];

/**
 * Get tool descriptions for the agent prompt
 */
export function getToolDescriptionsForPrompt(): string {
  const required = agentMcpTools.filter((t) => t.required);
  const optional = agentMcpTools.filter((t) => !t.required);

  let prompt = "## Available MCP Tools\n\n";
  prompt +=
    "You have access to these tools via the `mcp__task-runner` server:\n\n";

  prompt += "### Required (use these):\n";
  for (const tool of required) {
    prompt += `- **${tool.name}**: ${tool.description}\n  _When_: ${tool.when}\n`;
  }

  prompt += "\n### Optional (use as needed):\n";
  for (const tool of optional) {
    prompt += `- **${tool.name}**: ${tool.description}\n  _When_: ${tool.when}\n`;
  }

  return prompt;
}

/**
 * Get MCP tool names for the --allowedTools flag
 */
export function getMcpToolNames(): string[] {
  return agentMcpTools.map((t) => `mcp__task-runner__${t.name}`);
}

// ============================================================================
// Agent Configuration
// ============================================================================

export const agentConfig = {
  /**
   * Path to the Claude CLI executable
   * Can be overridden via CLAUDE_PATH environment variable
   */
  claudePath: process.env.CLAUDE_PATH || "claude",

  /**
   * Maximum time (ms) for a single task execution
   * Default: 30 minutes
   */
  timeout: 30 * 60 * 1000,

  /**
   * Maximum concurrent agent processes
   */
  maxConcurrentAgents: 3,

  /**
   * Task Runner MCP server URL (for Claude Code to connect)
   * Default: localhost:8100 (standard task-runner port)
   */
  taskRunnerMcpUrl: process.env.TASK_RUNNER_MCP_URL || "http://localhost:8100",

  /**
   * Allowed tools for Claude Code (whitelist approach)
   * These are the only tools the agent can use
   */
  allowedTools: [
    // File operations
    "Edit",
    "Read",
    "Write",

    // Git commands (version control)
    "Bash(git *)",

    // Package manager scripts
    "Bash(bun run *)",
    "Bash(npm run *)",
    "Bash(pnpm run *)",
    "Bash(yarn run *)",
    "Bash(deno task *)",

    // Testing
    "Bash(bun test *)",
    "Bash(npm test *)",
    "Bash(pnpm test *)",

    // MCP tools (added dynamically)
    ...getMcpToolNames(),
  ],

  /**
   * Explicitly denied patterns (for documentation and validation)
   * These patterns should NEVER be allowed even if they match allowedTools
   */
  deniedPatterns: [
    // Dangerous file deletion
    "rm -rf",
    "rimraf",
    "npx rimraf",
    "del /s /q",

    // System-wide changes
    "sudo rm",
    "sudo chmod",
    "chmod 777",
    "chmod -R 777",

    // Force operations that can't be undone
    "git push --force",
    "git push -f",
    "git reset --hard",

    // Package publishing (should be explicit)
    "npm publish",
    "pnpm publish",
    "bun publish",
  ],
};

/**
 * Get the allowed tools string for Claude CLI --allowedTools flag
 */
export function getAllowedToolsString(): string {
  return agentConfig.allowedTools.join(",");
}

/**
 * Check if a command matches any denied pattern
 */
export function isDeniedCommand(command: string): boolean {
  const lowerCommand = command.toLowerCase();
  return agentConfig.deniedPatterns.some((pattern) =>
    lowerCommand.includes(pattern.toLowerCase()),
  );
}

// ============================================================================
// Loop Configuration
// ============================================================================

export const loopConfig = {
  /**
   * Default maximum iterations for the execution loop
   */
  defaultMaxIterations: 10,

  /**
   * Default maximum tokens to spend (budget limit)
   * ~1M tokens ≈ $10-15 for Claude models
   */
  defaultMaxTokens: 1_000_000,

  /**
   * Default quality gates to run after each task
   */
  defaultQualityGates: ["bun run check", "bun run lint"],

  /**
   * Delay between loop iterations (ms)
   * Helps prevent rate limiting
   */
  iterationDelay: 1000,
};

// ============================================================================
// Session Configuration
// ============================================================================

export const sessionConfig = {
  /**
   * Maximum inline output size (bytes) in sessions.json
   * Larger outputs are stored in separate log files
   */
  maxInlineOutput: 10_000,

  /**
   * Session log directory relative to .beads/
   */
  logDirectory: "logs",

  /**
   * How long to keep completed sessions (ms)
   * Default: 7 days
   */
  sessionRetention: 7 * 24 * 60 * 60 * 1000,
};

// ============================================================================
// Beads Configuration
// ============================================================================

export const beadsConfig = {
  /**
   * Path to the Beads CLI
   */
  beadsPath: process.env.BEADS_PATH || "bd",

  /**
   * Auto-commit session state to git
   */
  autoCommitSessions: true,
};
