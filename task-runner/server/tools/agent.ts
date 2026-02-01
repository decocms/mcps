/**
 * Agent Tools
 *
 * Tools for spawning and managing Claude Code agents.
 * Uses Drover-style subprocess spawning with safety constraints.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../shared/deco.gen.ts";
import { getWorkspace, setWorkspace } from "./workspace.ts";
import {
  addSession,
  updateSession,
  getSession,
  getSessions,
  appendOutput,
  truncateOutput,
  generateSessionId,
  ensureLogDir,
  readLog,
  isProcessAlive,
  parseClaudeEvent,
  extractToolCall,
  extractMessage,
  addToolCall,
  addMessage,
  cleanupStaleSessions,
  type AgentSession,
} from "../sessions.ts";

import {
  agentConfig,
  getAllowedToolsString,
  getToolDescriptionsForPrompt,
} from "../config.ts";

// In-memory process references (for stopping)
const runningProcesses: Map<
  string,
  { proc: ReturnType<typeof Bun.spawn>; abortController: AbortController }
> = new Map();

// ============================================================================
// Helper Functions
// ============================================================================

// ============================================================================
// Types for enhanced task context
// ============================================================================

interface AcceptanceCriterion {
  id: string;
  description: string;
  completed?: boolean;
}

interface QualityGate {
  name: string;
  command: string;
  required: boolean;
}

interface TaskContext {
  taskId: string;
  taskTitle: string;
  taskDescription?: string;
  acceptanceCriteria?: AcceptanceCriterion[];
  qualityGates?: QualityGate[];
  workspace: string;
}

/**
 * Load quality gates from project config
 */
async function loadQualityGates(workspace: string): Promise<QualityGate[]> {
  try {
    const configPath = `${workspace}/.beads/project-config.json`;
    const content = await Bun.file(configPath).text();
    const config = JSON.parse(content) as { qualityGates?: QualityGate[] };
    return config.qualityGates ?? [];
  } catch {
    // Return defaults if no config
    return [
      { name: "Type Check", command: "bun run check", required: true },
      { name: "Lint", command: "bun run lint", required: true },
    ];
  }
}

/**
 * Load project memory summary
 */
async function loadMemorySummary(workspace: string): Promise<string> {
  const summaries: string[] = [];

  // Try to read MEMORY.md
  try {
    const memoryPath = `${workspace}/MEMORY.md`;
    const content = await Bun.file(memoryPath).text();
    // Get last 50 lines or 2000 chars
    const lines = content.split("\n").slice(-50);
    summaries.push("### From MEMORY.md:\n" + lines.join("\n").slice(-2000));
  } catch {
    // No memory file yet
  }

  // Try to read today's memory
  const today = new Date().toISOString().split("T")[0];
  try {
    const todayPath = `${workspace}/memory/${today}.md`;
    const content = await Bun.file(todayPath).text();
    summaries.push("### From today's notes:\n" + content.slice(-1000));
  } catch {
    // No today's notes yet
  }

  return summaries.length > 0
    ? summaries.join("\n\n")
    : "No project memory yet. Start writing discoveries to MEMORY.md";
}

/**
 * Build the context-rich prompt for an agent
 */
async function buildAgentPrompt(ctx: TaskContext): Promise<string> {
  const { taskId, taskTitle, taskDescription, acceptanceCriteria, workspace } =
    ctx;

  // Load project-specific data
  const qualityGates = ctx.qualityGates ?? (await loadQualityGates(workspace));
  const memorySummary = await loadMemorySummary(workspace);

  // Build acceptance criteria section
  let acceptanceCriteriaSection = "";
  if (acceptanceCriteria && acceptanceCriteria.length > 0) {
    acceptanceCriteriaSection = `
## Acceptance Criteria (ALL must be verified)
${acceptanceCriteria.map((c, i) => `${i + 1}. [ ] ${c.description}`).join("\n")}

You must verify EACH criterion before completing. Check them off mentally as you work.
`;
  }

  // Build quality gates section
  const requiredGates = qualityGates.filter((g) => g.required);
  let qualityGatesSection = "";
  if (requiredGates.length > 0) {
    qualityGatesSection = `
## Quality Gates (ALL must pass - MANDATORY)
${requiredGates.map((g) => `- \`${g.command}\` (${g.name})`).join("\n")}

**CRITICAL: ALL quality gates must pass before you can complete the task.**

- Run each gate command and verify it exits with code 0
- If ANY gate fails, YOU MUST FIX IT before completing
- This includes ALL errors in the codebase, not just ones you introduced
- Pre-existing errors are YOUR responsibility - fix them or the task is incomplete
- Do NOT output <promise>COMPLETE</promise> until all gates pass
- Do NOT rationalize "these errors existed before" - that is not acceptable
- If you cannot fix a gate failure, explain why and do NOT mark the task complete

**SESSION_LAND will verify gates pass. If they fail, success=false and task remains incomplete.**
`;
  }

  // Get tool descriptions for the prompt
  const toolDescriptions = getToolDescriptionsForPrompt();

  return `You are working on a coding task in: ${workspace}

IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning.
Read existing code and documentation before making assumptions.

## MANDATORY SAFETY RULES
1. COMMIT FREQUENTLY: After each logical change, run:
   \`git add -A && git commit -m "descriptive message (${taskId})"\`
   Always include the task ID in parentheses at the end of commit messages.
2. NEVER DELETE DIRECTORIES: Do not use rm -rf, rimraf, or similar
3. SMALL CHANGES: Make incremental changes, test after each
4. ASK IF UNSURE: If requirements are unclear, explain what's unclear
5. LAND THE PLANE: Always call SESSION_LAND before ending, even if incomplete

## Current Task
**${taskTitle}** (ID: ${taskId})

${taskDescription || "No additional description provided."}
${acceptanceCriteriaSection}
${qualityGatesSection}

${toolDescriptions}

## Session Workflow

### 1. At Session Start
- Call \`mcp__task-runner__MEMORY_READ\` to load project context
- Call \`mcp__task-runner__MEMORY_RECALL\` to search knowledge base for relevant past learnings
- This gives you knowledge from previous agents working on this project

### 2. During Work
- Commit frequently with descriptive messages including the task ID: \`git commit -m "Add feature X (${taskId})"\`
- **LEARNED: pattern** - When you discover something worth remembering, call \`mcp__task-runner__MEMORY_KNOWLEDGE\`:
  - Conventions: "API endpoints follow /v2/{resource}/{id} pattern"
  - Gotchas: "Rate limit is 100 req/min - add exponential backoff"
  - Patterns: "Component X uses pattern Y for state management"
- If you fix an error, call \`mcp__task-runner__MEMORY_RECORD_ERROR\` to help future sessions
- If you identify out-of-scope work, create follow-up tasks with \`mcp__task-runner__TASK_CREATE\`

### 3. Landing the Plane (MANDATORY before ending)

**CRITICAL: You MUST call SESSION_LAND before outputting the completion token or ending the session.**

The SESSION_LAND tool handles:
1. Running quality gates
2. Committing all changes
3. Recording learnings to memory
4. Creating follow-up tasks for remaining work
5. Generating a continuation prompt for the next session

**NEVER end a session without calling SESSION_LAND. This ensures:**
- Nothing is left uncommitted
- Learnings are captured for future sessions
- Follow-up work is tracked
- Next agent can pick up where you left off

### 4. Retrospective (for significant tasks)

For complex tasks, consider running a retrospective after completion:
\`mcp__task-runner__TASK_RETRO\`

This captures:
- What went well (reuse these approaches)
- What could be improved (avoid these pitfalls)
- Patterns discovered (add to knowledge base)
- Recommendations for similar tasks

## Project Memory (from previous sessions)

${memorySummary}

## Completion Protocol

When you believe the task is complete:

1. **Run all quality gates manually first** - do not rely on SESSION_LAND to catch failures
2. **Fix ALL gate failures** - even pre-existing ones. You are responsible for the whole codebase.
3. **Verify all acceptance criteria** are satisfied
4. **Call SESSION_LAND** with:
   - Summary of what was accomplished
   - Key learnings from this session
   - Any follow-up tasks for remaining work
5. **Check SESSION_LAND response** - if allGatesPassed=false, FIX THE ISSUES and try again
6. **Only when allGatesPassed=true**, output: <promise>COMPLETE</promise>

**CRITICAL: If SESSION_LAND returns success=false or allGatesPassed=false, the task is NOT complete.**
You MUST fix the failing gates before outputting the completion token.

If you CANNOT complete the task (blockers, unclear requirements, gates you cannot fix):

1. **Call SESSION_LAND** with:
   - Summary of what was attempted
   - Learnings from the attempt
   - Description of what's blocking (including which gates failed and why you can't fix them)
2. **Do NOT output the completion token**
3. The SESSION_LAND tool will create a continuation prompt for the next session

**REMEMBER: The plane has NOT landed until SESSION_LAND completes.**
`;
}

/**
 * Run a command and return output
 */
async function runCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn([command, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return { stdout, stderr, exitCode };
}

// ============================================================================
// AGENT_SPAWN
// ============================================================================

export const createAgentSpawnTool = (_env: Env) =>
  createPrivateTool({
    id: "AGENT_SPAWN",
    description:
      "Spawn a Claude Code agent to work on a task. The agent runs in a subprocess with restricted permissions. Returns immediately with session ID - use AGENT_STATUS to check progress.",
    inputSchema: z.object({
      taskId: z.string().describe("The Beads task ID to work on"),
      taskTitle: z.string().describe("Title of the task"),
      taskDescription: z.string().optional().describe("Detailed description"),
      workspace: z
        .string()
        .optional()
        .describe(
          "Workspace directory (optional if WORKSPACE_SET was called previously)",
        ),
      timeout: z
        .number()
        .optional()
        .describe("Timeout in milliseconds (default: 30 minutes)"),
    }),
    outputSchema: z.object({
      sessionId: z.string().describe("Unique session ID for this agent run"),
      pid: z.number().describe("Process ID of the Claude Code process"),
      status: z.string().describe("Initial status (running)"),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      // Use provided workspace or fall back to global
      // Get workspace from param or global, and update global for other tools
      let workspace: string;
      if (context.workspace) {
        workspace = context.workspace;
        setWorkspace(workspace); // Update global for memory tools etc.
      } else {
        workspace = getWorkspace();
      }
      const { taskId, taskTitle, taskDescription, timeout } = context;

      // Clean up any stale sessions from previous runs
      await cleanupStaleSessions(workspace);
      const timeoutMs = timeout ?? agentConfig.timeout;

      // Generate session ID
      const sessionId = generateSessionId();

      // Ensure log directory exists
      await ensureLogDir(workspace);

      // Build the prompt with full context
      const prompt = await buildAgentPrompt({
        taskId,
        taskTitle,
        taskDescription,
        workspace,
      });

      // Create abort controller for timeout
      const abortController = new AbortController();

      // Spawn Claude Code process with JSON output
      // NOTE: Claude Code CLI doesn't support --mcp flag yet
      // MCP tools are referenced in the prompt but called via Bash commands
      const proc = Bun.spawn(
        [
          agentConfig.claudePath,
          "-p",
          prompt,
          "--dangerously-skip-permissions",
          "--allowedTools",
          getAllowedToolsString(),
          "--output-format",
          "stream-json",
        ],
        {
          cwd: workspace,
          stdout: "pipe",
          stderr: "pipe",
          signal: abortController.signal,
        },
      );

      const pid = proc.pid;

      // Store process reference
      runningProcesses.set(sessionId, { proc, abortController });

      // Create initial session record
      const session: AgentSession = {
        id: sessionId,
        taskId,
        taskTitle,
        pid,
        status: "running",
        startedAt: new Date().toISOString(),
        output: "",
        toolCalls: [],
        messages: [],
      };
      await addSession(workspace, session);

      // Set up timeout
      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, timeoutMs);

      // Handle process completion in background
      (async () => {
        try {
          // Capture stdout and parse JSON events
          const stdoutReader = proc.stdout.getReader();
          let fullOutput = "";
          let lineBuffer = "";

          while (true) {
            const { done, value } = await stdoutReader.read();
            if (done) break;
            const chunk = new TextDecoder().decode(value);
            fullOutput += chunk;
            lineBuffer += chunk;

            // Process complete lines for JSON parsing
            const lines = lineBuffer.split("\n");
            lineBuffer = lines.pop() || ""; // Keep incomplete line in buffer

            for (const line of lines) {
              // Log raw output
              await appendOutput(workspace, sessionId, line + "\n");

              // Try to parse as Claude JSON event
              const event = parseClaudeEvent(line);
              if (event) {
                // Extract and log tool calls
                const toolCall = extractToolCall(event);
                if (toolCall) {
                  await addToolCall(workspace, sessionId, toolCall);
                  console.log(
                    `[${sessionId}] Tool: ${toolCall.name}`,
                    toolCall.input
                      ? JSON.stringify(toolCall.input).slice(0, 100)
                      : "",
                  );
                }

                // Extract and log messages
                const message = extractMessage(event);
                if (message) {
                  await addMessage(workspace, sessionId, message);
                  if (message.role === "assistant") {
                    console.log(
                      `[${sessionId}] Assistant: ${message.content.slice(0, 100)}...`,
                    );
                  }
                }
              }
            }
          }

          // Process remaining buffer
          if (lineBuffer.trim()) {
            await appendOutput(workspace, sessionId, lineBuffer + "\n");
            const event = parseClaudeEvent(lineBuffer);
            if (event) {
              const toolCall = extractToolCall(event);
              if (toolCall) {
                await addToolCall(workspace, sessionId, toolCall);
              }
              const message = extractMessage(event);
              if (message) {
                await addMessage(workspace, sessionId, message);
              }
            }
          }

          // Capture stderr
          const stderrReader = proc.stderr.getReader();
          while (true) {
            const { done, value } = await stderrReader.read();
            if (done) break;
            const chunk = new TextDecoder().decode(value);
            fullOutput += chunk;
            await appendOutput(workspace, sessionId, `[stderr] ${chunk}`);
          }

          const exitCode = await proc.exited;
          clearTimeout(timeoutId);
          runningProcesses.delete(sessionId);

          // Determine status - check for explicit completion token
          // The agent outputs <promise>COMPLETE</promise> when task is truly done
          const hasCompletionToken = fullOutput.includes(
            "<promise>COMPLETE</promise>",
          );
          const completed = exitCode === 0 && hasCompletionToken;
          // If agent exited cleanly but didn't output completion token, it's "stopped" (incomplete)
          const status: "completed" | "failed" | "stopped" = completed
            ? "completed"
            : exitCode === 0
              ? "stopped" // Agent exited but didn't complete the task
              : "failed";

          console.log(
            `[${sessionId}] Exit code: ${exitCode}, Has completion token: ${hasCompletionToken}, Status: ${status}`,
          );

          // Update session
          await updateSession(workspace, sessionId, {
            status,
            exitCode,
            completedAt: new Date().toISOString(),
            output: truncateOutput(fullOutput),
          });

          // If completed, auto-commit and update Beads task
          if (completed) {
            try {
              await runCommand("git", ["add", "-A"], workspace);
              await runCommand(
                "git",
                ["commit", "-m", `task: ${taskId} - ${taskTitle}`],
                workspace,
              );
            } catch {
              // Git commit might fail if no changes, that's ok
            }

            // Update task status directly in tasks.json (bd CLI might not be available)
            try {
              const tasksPath = `${workspace}/.beads/tasks.json`;
              const tasksFile = Bun.file(tasksPath);
              const tasksContent = await tasksFile.text();
              const tasksData = JSON.parse(tasksContent) as {
                tasks: Array<{
                  id: string;
                  status: string;
                  updatedAt?: string;
                }>;
              };

              const task = tasksData.tasks.find((t) => t.id === taskId);
              if (task) {
                task.status = "closed";
                task.updatedAt = new Date().toISOString();
                await Bun.write(tasksPath, JSON.stringify(tasksData, null, 2));
              }
            } catch {
              // Fallback: try bd CLI
              try {
                await runCommand(
                  "bd",
                  ["close", taskId, "--reason", "Completed by agent"],
                  workspace,
                );
              } catch {
                // Both methods failed, log but continue
                console.error(`Failed to mark task ${taskId} as closed`);
              }
            }
          }
        } catch (error) {
          clearTimeout(timeoutId);
          runningProcesses.delete(sessionId);

          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error(`[${sessionId}] Agent error:`, errorMessage);

          try {
            await updateSession(workspace, sessionId, {
              status: "failed",
              error: errorMessage,
              completedAt: new Date().toISOString(),
            });
          } catch (updateError) {
            console.error(
              `[${sessionId}] Failed to update session:`,
              updateError,
            );
          }
        }
      })().catch((unhandledError) => {
        // Final catch for any unhandled promise rejections
        console.error(
          `[${sessionId}] Unhandled error in agent handler:`,
          unhandledError,
        );
        runningProcesses.delete(sessionId);
      });

      return {
        sessionId,
        pid,
        status: "running",
        message: `Agent spawned for task ${taskId}. Use AGENT_STATUS to check progress.`,
      };
    },
  });

// ============================================================================
// AGENT_STATUS
// ============================================================================

export const createAgentStatusTool = (_env: Env) =>
  createPrivateTool({
    id: "AGENT_STATUS",
    description:
      "Check the status of a running or completed agent session. Can retrieve recent output.",
    inputSchema: z.object({
      sessionId: z
        .string()
        .optional()
        .describe(
          "Specific session ID to check. If omitted, returns all sessions.",
        ),
      includeOutput: z
        .boolean()
        .optional()
        .describe(
          "Include the captured output (default: false for list, true for single)",
        ),
    }),
    outputSchema: z.union([
      z.object({
        session: z.object({
          id: z.string(),
          taskId: z.string(),
          pid: z.number(),
          status: z.string(),
          startedAt: z.string(),
          completedAt: z.string().optional(),
          exitCode: z.number().optional(),
          error: z.string().optional(),
          output: z.string().optional(),
          isAlive: z.boolean(),
        }),
      }),
      z.object({
        sessions: z.array(
          z.object({
            id: z.string(),
            taskId: z.string(),
            pid: z.number(),
            status: z.string(),
            startedAt: z.string(),
            completedAt: z.string().optional(),
          }),
        ),
        total: z.number(),
      }),
    ]),
    execute: async ({ context }) => {
      const workspace = getWorkspace();
      const { sessionId, includeOutput } = context;

      if (sessionId) {
        // Get specific session
        const session = await getSession(workspace, sessionId);
        if (!session) {
          throw new Error(`Session not found: ${sessionId}`);
        }

        // Check if process is still alive
        const isAlive =
          session.status === "running" && (await isProcessAlive(session.pid));

        // Get full output if requested
        let output = session.output;
        if (includeOutput !== false) {
          output = await readLog(workspace, sessionId);
        }

        return {
          session: {
            ...session,
            output: includeOutput !== false ? output : undefined,
            isAlive,
            // Include tool calls and messages for richer logging
            toolCalls: session.toolCalls || [],
            messages: session.messages || [],
          },
        };
      }

      // List all sessions
      const sessions = await getSessions(workspace);
      const runningSessions = sessions.filter((s) => s.status === "running");

      return {
        sessions: sessions.map((s) => ({
          id: s.id,
          sessionId: s.id, // Alias for compatibility
          taskId: s.taskId,
          taskTitle: s.taskTitle || s.taskId,
          pid: s.pid,
          status: s.status,
          startedAt: s.startedAt,
          completedAt: s.completedAt,
          toolCallCount: s.toolCalls?.length || 0,
        })),
        total: sessions.length,
        runningSessions: runningSessions.length,
      };
    },
  });

// ============================================================================
// AGENT_STOP
// ============================================================================

export const createAgentStopTool = (_env: Env) =>
  createPrivateTool({
    id: "AGENT_STOP",
    description: "Stop a running agent session gracefully.",
    inputSchema: z.object({
      sessionId: z.string().describe("The session ID to stop"),
      force: z
        .boolean()
        .optional()
        .describe("Force kill (SIGKILL) instead of graceful (SIGTERM)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
      finalStatus: z.string(),
    }),
    execute: async ({ context }) => {
      const workspace = getWorkspace();
      const { sessionId, force } = context;

      // Check session exists
      const session = await getSession(workspace, sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      if (session.status !== "running") {
        return {
          success: false,
          message: `Session is not running (status: ${session.status})`,
          finalStatus: session.status,
        };
      }

      // Try to stop the process
      const processRef = runningProcesses.get(sessionId);
      if (processRef) {
        processRef.abortController.abort();
        runningProcesses.delete(sessionId);
      } else {
        // Process reference not found, try to kill by PID
        try {
          process.kill(session.pid, force ? "SIGKILL" : "SIGTERM");
        } catch {
          // Process may already be dead
        }
      }

      // Update session status
      await updateSession(workspace, sessionId, {
        status: "stopped",
        completedAt: new Date().toISOString(),
        error: "Stopped by user",
      });

      return {
        success: true,
        message: `Session ${sessionId} stopped`,
        finalStatus: "stopped",
      };
    },
  });

// ============================================================================
// SESSION_LAND - "Land the plane" for agent sessions
// Inspired by: https://github.com/steveyegge/beads/blob/main/AGENT_INSTRUCTIONS.md
// ============================================================================

export const createSessionLandTool = (_env: Env) =>
  createPrivateTool({
    id: "SESSION_LAND",
    description: `"Land the plane" - properly complete a session with all cleanup.

This tool ensures nothing is left incomplete:
1. Runs quality gates (if they exist)
2. Commits all changes to git
3. Records any final learnings to memory
4. Creates follow-up tasks for remaining work
5. Provides a continuation prompt for the next session

Call this BEFORE outputting <promise>COMPLETE</promise> or when you cannot continue.`,
    inputSchema: z.object({
      taskId: z.string().describe("Task ID being completed"),
      summary: z.string().describe("Brief summary of what was accomplished"),
      learnings: z
        .array(z.string())
        .optional()
        .describe("Key learnings from this session"),
      followUpTasks: z
        .array(
          z.object({
            title: z.string(),
            description: z.string().optional(),
            priority: z.number().optional(),
          }),
        )
        .optional()
        .describe("Follow-up tasks to create for remaining work"),
      blockers: z
        .string()
        .optional()
        .describe("If incomplete, explain what's blocking"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      gateResults: z
        .array(
          z.object({
            gate: z.string(),
            passed: z.boolean(),
          }),
        )
        .optional(),
      allGatesPassed: z.boolean(),
      committed: z.boolean(),
      commitHash: z.string().optional(),
      followUpTaskIds: z.array(z.string()),
      continuationPrompt: z.string(),
    }),
    execute: async ({ context }) => {
      const { taskId, summary, learnings, followUpTasks, blockers } = context;
      const workspace = getWorkspace();

      if (!workspace) {
        return {
          success: false,
          allGatesPassed: false,
          committed: false,
          followUpTaskIds: [],
          continuationPrompt: "",
        };
      }

      const results = {
        success: true, // Will be set to false if required gates fail
        gateResults: [] as Array<{ gate: string; passed: boolean }>,
        allGatesPassed: true,
        committed: false,
        commitHash: undefined as string | undefined,
        followUpTaskIds: [] as string[],
        continuationPrompt: "",
      };

      // 1. Run quality gates
      try {
        const configPath = `${workspace}/.beads/project-config.json`;
        const configContent = await Bun.file(configPath).text();
        const config = JSON.parse(configContent) as {
          qualityGates?: Array<{
            name: string;
            command: string;
            required: boolean;
          }>;
        };

        if (config.qualityGates && config.qualityGates.length > 0) {
          for (const gate of config.qualityGates.filter((g) => g.required)) {
            const [cmd, ...args] = gate.command.split(" ");
            try {
              const proc = Bun.spawn([cmd, ...args], {
                cwd: workspace,
                stdout: "pipe",
                stderr: "pipe",
              });
              const exitCode = await proc.exited;
              const passed = exitCode === 0;
              results.gateResults.push({ gate: gate.name, passed });
              if (!passed) {
                results.allGatesPassed = false;
                results.success = false; // Task cannot be marked complete if gates fail
              }
            } catch {
              results.gateResults.push({ gate: gate.name, passed: false });
              results.allGatesPassed = false;
              results.success = false;
            }
          }
        }
      } catch {
        // No quality gates configured
      }

      // 2. Record learnings to memory
      if (learnings && learnings.length > 0) {
        const today = new Date().toISOString().split("T")[0];
        const memoryPath = `${workspace}/MEMORY.md`;
        let memoryContent = "";
        try {
          memoryContent = await Bun.file(memoryPath).text();
        } catch {
          memoryContent =
            "# Project Memory\n\nCurated knowledge about this project.\n";
        }

        const learningEntries = learnings
          .map((l) => `- ${l} _(${today}, task ${taskId})_`)
          .join("\n");

        if (!memoryContent.includes("## Session Learnings")) {
          memoryContent += "\n## Session Learnings\n\n";
        }

        // Append learnings
        const insertPoint = memoryContent.indexOf("## Session Learnings") + 21;
        const lineEnd = memoryContent.indexOf("\n", insertPoint);
        memoryContent =
          memoryContent.slice(0, lineEnd + 1) +
          learningEntries +
          "\n" +
          memoryContent.slice(lineEnd + 1);

        await Bun.write(memoryPath, memoryContent);
      }

      // 3. Create follow-up tasks
      if (followUpTasks && followUpTasks.length > 0) {
        const tasksPath = `${workspace}/.beads/tasks.json`;
        try {
          const tasksContent = await Bun.file(tasksPath).text();
          const tasksData = JSON.parse(tasksContent) as {
            tasks: Array<{ id: string }>;
          };

          for (const task of followUpTasks) {
            const newId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            tasksData.tasks.push({
              id: newId,
              title: task.title,
              description: task.description || `Follow-up from ${taskId}`,
              status: "open",
              priority: task.priority ?? 2,
              createdAt: new Date().toISOString(),
            } as { id: string });
            results.followUpTaskIds.push(newId);
          }

          await Bun.write(tasksPath, JSON.stringify(tasksData, null, 2));
        } catch {
          // No tasks file
        }
      }

      // 4. Commit all changes
      try {
        await runCommand("git", ["add", "-A"], workspace);
        const commitMsg = blockers
          ? `WIP: ${taskId} - ${summary} (blocked: ${blockers.slice(0, 50)})`
          : `task: ${taskId} - ${summary}`;
        await runCommand("git", ["commit", "-m", commitMsg], workspace);

        // Get commit hash
        const hashResult = await runCommand(
          "git",
          ["rev-parse", "--short", "HEAD"],
          workspace,
        );
        results.commitHash = hashResult.stdout.trim();
        results.committed = true;
      } catch {
        // Commit might fail if no changes
      }

      // 5. Build continuation prompt
      if (blockers) {
        results.continuationPrompt = `Continue work on ${taskId}: "${summary}". 
BLOCKED: ${blockers}
Follow-up tasks created: ${results.followUpTaskIds.join(", ") || "none"}
Next steps: Resolve the blocker and continue implementation.`;
      } else if (results.followUpTaskIds.length > 0) {
        results.continuationPrompt = `${taskId} completed: "${summary}".
Follow-up tasks to pick up: ${results.followUpTaskIds.join(", ")}
Recommend starting with: ${results.followUpTaskIds[0]}`;
      } else {
        results.continuationPrompt = `${taskId} completed: "${summary}".
All work finished. Run \`TASK_LIST\` to see what's next.`;
      }

      return results;
    },
  });

// ============================================================================
// Export all agent tools
// ============================================================================

export const agentTools = [
  createAgentSpawnTool,
  createAgentStatusTool,
  createAgentStopTool,
  createSessionLandTool,
];
