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

import { agentConfig, getAllowedToolsString } from "../config.ts";

// In-memory process references (for stopping)
const runningProcesses: Map<string, { proc: ReturnType<typeof Bun.spawn>; abortController: AbortController }> = new Map();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build the safety prompt for an agent
 */
function buildAgentPrompt(
  taskId: string,
  taskTitle: string,
  taskDescription: string | undefined,
  workspace: string,
): string {
  const today = new Date().toISOString().split("T")[0];
  return `You are working on a coding task in: ${workspace}

## MANDATORY SAFETY RULES
1. COMMIT FREQUENTLY: After each logical change, run:
   git add -A && git commit -m "descriptive message"
2. NEVER DELETE DIRECTORIES: Do not use rm -rf, rimraf, or similar
3. SMALL CHANGES: Make incremental changes, test after each
4. ASK IF UNSURE: If requirements are unclear, explain what's unclear

## Current Task
**${taskTitle}** (ID: ${taskId})

${taskDescription || "No additional description provided."}

## Project Memory

**At session start**, read existing memories to load context:
- Check \`MEMORY.md\` for long-term project knowledge
- Check \`memory/${today}.md\` for today's notes

**During work**, write discoveries and decisions:
- Daily notes → append to \`memory/${today}.md\`
- Durable facts, decisions, architecture insights → append to \`MEMORY.md\`

**Examples of what to write:**
- "Discovered that component X uses pattern Y"
- "Decision: Using approach A over B because..."
- "Important: The /api/v2 endpoints require auth header X-API-Key"
- "Pattern: This project uses \${workspace}/sections for UI components"

Memory files are Markdown. Append entries with timestamps. This builds project knowledge over time.

## Beads Task Tracking
- Task ID: ${taskId}
- Status: in_progress

## Quality Gates
After completing, these should pass:
- bun run check (if available)
- bun run lint (if available)

## Completion
When done and verified:
1. Commit all changes
2. Write any important learnings to memory
3. Output exactly: <promise>COMPLETE</promise>

If you cannot complete, explain why and do NOT output the completion token.
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

      // Build the prompt
      const prompt = buildAgentPrompt(
        taskId,
        taskTitle,
        taskDescription,
        workspace,
      );

      // Create abort controller for timeout
      const abortController = new AbortController();

      // Spawn Claude Code process with JSON output for structured logging
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
                    toolCall.input ? JSON.stringify(toolCall.input).slice(0, 100) : "",
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

          // Determine status - exitCode 0 means success
          // (stream-json output doesn't include <promise>COMPLETE</promise> marker)
          const completed = exitCode === 0;
          const status = completed ? "completed" : "failed";

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
                tasks: Array<{ id: string; status: string; updatedAt?: string }>;
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
                await runCommand("bd", ["close", taskId, "--reason", "Completed by agent"], workspace);
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
        .describe("Specific session ID to check. If omitted, returns all sessions."),
      includeOutput: z
        .boolean()
        .optional()
        .describe("Include the captured output (default: false for list, true for single)"),
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
        const isAlive = session.status === "running" && (await isProcessAlive(session.pid));

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
// Export all agent tools
// ============================================================================

export const agentTools = [
  createAgentSpawnTool,
  createAgentStatusTool,
  createAgentStopTool,
];
