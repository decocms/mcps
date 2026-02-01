/**
 * Task Runner Configuration
 *
 * Configuration for the Task Runner MCP, including:
 * - Claude Code agent settings
 * - Allowed/denied tool patterns
 * - Timeout and resource limits
 */

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
