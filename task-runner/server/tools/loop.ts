/**
 * Ralph Loop Engine Tools
 *
 * Implements the Ralph-style execution loop:
 * SELECT → PROMPT → EXECUTE → EVALUATE → (repeat)
 *
 * Reference: https://ralph-tui.com/docs
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../shared/deco.gen.ts";
import { getWorkspace } from "./workspace.ts";
import {
  buildSafePrompt,
  detectCompletion as detectCompletionFromPrompt,
} from "../prompts/safe-agent.ts";
import {
  addSession,
  updateSession,
  appendOutput,
  truncateOutput,
  generateSessionId,
  ensureLogDir,
} from "../sessions.ts";
import { agentConfig, getAllowedToolsString, loopConfig } from "../config.ts";

// ============================================================================
// Loop State
// ============================================================================

interface LoopState {
  status: "idle" | "running" | "paused" | "completed" | "failed";
  currentTask: string | null;
  iteration: number;
  maxIterations: number;
  totalTokens: number;
  maxTokens: number;
  startedAt: string | null;
  lastActivity: string | null;
  tasksCompleted: string[];
  tasksFailed: string[];
  error: string | null;
}

// In-memory loop state
let loopState: LoopState = {
  status: "idle",
  currentTask: null,
  iteration: 0,
  maxIterations: 10,
  totalTokens: 0,
  maxTokens: 1000000, // ~$10 budget
  startedAt: null,
  lastActivity: null,
  tasksCompleted: [],
  tasksFailed: [],
  error: null,
};

// Flag to control loop execution
let shouldStop = false;

/**
 * Run a command and get output
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

/**
 * Get ready tasks from Beads
 */
async function getReadyTasks(
  cwd: string,
): Promise<Array<{ id: string; title: string; description?: string }>> {
  const result = await runCommand("bd", ["ready", "--json"], cwd);
  if (result.exitCode !== 0) {
    throw new Error(`bd ready failed: ${result.stderr}`);
  }
  try {
    return JSON.parse(result.stdout) ?? [];
  } catch {
    return [];
  }
}

/**
 * Close a task
 */
async function closeTask(
  taskId: string,
  reason: string,
  cwd: string,
): Promise<void> {
  await runCommand("bd", ["close", taskId, "--reason", reason], cwd);
}

/**
 * Update task status
 */
async function updateTaskStatus(
  taskId: string,
  status: string,
  cwd: string,
): Promise<void> {
  await runCommand("bd", ["update", taskId, "--status", status], cwd);
}

/**
 * Run quality gates
 */
async function runQualityGates(
  gates: string[],
  cwd: string,
): Promise<{ passed: boolean; output: string }> {
  const outputs: string[] = [];

  for (const gate of gates) {
    const parts = gate.split(" ");
    const cmd = parts[0];
    const args = parts.slice(1);

    const result = await runCommand(cmd, args, cwd);
    outputs.push(`$ ${gate}\n${result.stdout}${result.stderr}`);

    if (result.exitCode !== 0) {
      return {
        passed: false,
        output: outputs.join("\n---\n"),
      };
    }
  }

  return {
    passed: true,
    output: outputs.join("\n---\n"),
  };
}

/**
 * Call Claude CLI with prompt using safety constraints
 * Uses --allowedTools to restrict dangerous operations
 */
async function callAgent(
  task: { id: string; title: string; description?: string },
  cwd: string,
  qualityGates: string[],
): Promise<{ output: string; tokensUsed: number; sessionId: string }> {
  // Build safe prompt with all safety rules
  const prompt = buildSafePrompt(
    { id: task.id, title: task.title, description: task.description },
    { workspace: cwd, qualityGates },
  );

  // Generate session ID for tracking
  const sessionId = generateSessionId();
  await ensureLogDir(cwd);

  // Create session record
  await addSession(cwd, {
    id: sessionId,
    taskId: task.id,
    pid: 0, // Will update after spawn
    status: "running",
    startedAt: new Date().toISOString(),
    output: "",
  });

  // Spawn claude with safety constraints
  const proc = Bun.spawn(
    [
      agentConfig.claudePath,
      "-p",
      prompt,
      "--dangerously-skip-permissions",
      "--allowedTools",
      getAllowedToolsString(),
    ],
    {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  // Update session with actual PID
  await updateSession(cwd, sessionId, { pid: proc.pid });

  // Capture output
  let fullOutput = "";

  // Read stdout
  const stdoutReader = proc.stdout.getReader();
  while (true) {
    const { done, value } = await stdoutReader.read();
    if (done) break;
    const chunk = new TextDecoder().decode(value);
    fullOutput += chunk;
    await appendOutput(cwd, sessionId, chunk);
  }

  // Read stderr
  const stderrReader = proc.stderr.getReader();
  while (true) {
    const { done, value } = await stderrReader.read();
    if (done) break;
    const chunk = new TextDecoder().decode(value);
    fullOutput += chunk;
    await appendOutput(cwd, sessionId, `[stderr] ${chunk}`);
  }

  const exitCode = await proc.exited;

  // Determine status
  const completed = detectCompletionFromPrompt(fullOutput);
  const status = completed ? "completed" : "failed";

  // Update session
  await updateSession(cwd, sessionId, {
    status,
    exitCode,
    completedAt: new Date().toISOString(),
    output: truncateOutput(fullOutput),
  });

  // Auto-commit after successful completion
  if (completed) {
    await runCommand("git", ["add", "-A"], cwd);
    await runCommand(
      "git",
      ["commit", "-m", `task: ${task.id} - ${task.title}`],
      cwd,
    );
  }

  // Estimate tokens (rough: 4 chars per token)
  const tokensUsed = Math.ceil((prompt.length + fullOutput.length) / 4);

  return {
    output: fullOutput,
    tokensUsed,
    sessionId,
  };
}

/**
 * Check if output contains completion token
 * (Wrapper for the safe-agent module function)
 */
function detectCompletion(output: string): boolean {
  return detectCompletionFromPrompt(output);
}

// ============================================================================
// LOOP_START
// ============================================================================

export const createLoopStartTool = (_env: Env) =>
  createPrivateTool({
    id: "LOOP_START",
    description:
      "Start the Ralph execution loop. Picks tasks from Beads, calls Claude, checks completion. Runs until all tasks done, max iterations, or budget exhausted.",
    inputSchema: z.object({
      maxIterations: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Maximum iterations (default: 10)"),
      maxTokens: z
        .number()
        .optional()
        .describe("Maximum tokens to spend (default: 1000000)"),
      qualityGates: z
        .array(z.string())
        .optional()
        .describe(
          "Commands that must pass after each task (e.g., ['bun run check'])",
        ),
      singleIteration: z
        .boolean()
        .optional()
        .describe("Run only one iteration then stop (for testing)"),
    }),
    outputSchema: z.object({
      status: z.string(),
      iterations: z.number(),
      tasksCompleted: z.array(z.string()),
      tasksFailed: z.array(z.string()),
      totalTokens: z.number(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const workspace = getWorkspace();
      const maxIterations =
        context.maxIterations ?? loopConfig.defaultMaxIterations;
      const maxTokens = context.maxTokens ?? loopConfig.defaultMaxTokens;
      const qualityGates =
        context.qualityGates ?? loopConfig.defaultQualityGates;
      const singleIteration = context.singleIteration ?? false;

      // Initialize loop state
      loopState = {
        status: "running",
        currentTask: null,
        iteration: 0,
        maxIterations,
        totalTokens: 0,
        maxTokens,
        startedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        tasksCompleted: [],
        tasksFailed: [],
        error: null,
      };
      shouldStop = false;

      try {
        // Main loop
        while (
          loopState.iteration < maxIterations &&
          loopState.totalTokens < maxTokens &&
          !shouldStop
        ) {
          loopState.iteration++;
          loopState.lastActivity = new Date().toISOString();

          // SELECT: Get ready tasks
          const tasks = await getReadyTasks(workspace);

          if (tasks.length === 0) {
            loopState.status = "completed";
            break;
          }

          const task = tasks[0];
          loopState.currentTask = task.id;

          // Mark as in progress
          await updateTaskStatus(task.id, "in_progress", workspace);

          // EXECUTE: Call agent with safety constraints
          const { output, tokensUsed } = await callAgent(
            task,
            workspace,
            qualityGates,
          );
          loopState.totalTokens += tokensUsed;

          // DETECT: Check for completion token
          const completed = detectCompletion(output);

          if (completed) {
            // GATES: Run quality gates
            const gatesResult = await runQualityGates(qualityGates, workspace);

            if (gatesResult.passed) {
              // Success! Close the task
              await closeTask(task.id, "Completed", workspace);
              loopState.tasksCompleted.push(task.id);
            } else {
              // Gates failed, keep task open for retry
              await updateTaskStatus(task.id, "open", workspace);
              loopState.tasksFailed.push(task.id);
            }
          } else {
            // Agent didn't complete, mark as failed for this iteration
            await updateTaskStatus(task.id, "open", workspace);
          }

          // Single iteration mode
          if (singleIteration) {
            break;
          }
        }

        // Determine final status
        if (shouldStop) {
          loopState.status = "paused";
        } else if (loopState.iteration >= maxIterations) {
          loopState.status = "completed";
        } else if (loopState.totalTokens >= maxTokens) {
          loopState.status = "completed";
        }

        loopState.currentTask = null;

        return {
          status: loopState.status,
          iterations: loopState.iteration,
          tasksCompleted: loopState.tasksCompleted,
          tasksFailed: loopState.tasksFailed,
          totalTokens: loopState.totalTokens,
          message: `Loop ${loopState.status} after ${loopState.iteration} iterations`,
        };
      } catch (error) {
        loopState.status = "failed";
        loopState.error = String(error);
        throw error;
      }
    },
  });

// ============================================================================
// LOOP_STATUS
// ============================================================================

export const createLoopStatusTool = (_env: Env) =>
  createPrivateTool({
    id: "LOOP_STATUS",
    description: "Get the current status of the execution loop.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      status: z.string(),
      currentTask: z.string().nullable(),
      iteration: z.number(),
      maxIterations: z.number(),
      totalTokens: z.number(),
      maxTokens: z.number(),
      tasksCompleted: z.array(z.string()),
      tasksFailed: z.array(z.string()),
      startedAt: z.string().nullable(),
      lastActivity: z.string().nullable(),
      error: z.string().nullable(),
    }),
    execute: async () => {
      return loopState;
    },
  });

// ============================================================================
// LOOP_PAUSE
// ============================================================================

export const createLoopPauseTool = (_env: Env) =>
  createPrivateTool({
    id: "LOOP_PAUSE",
    description: "Pause the execution loop after the current task completes.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async () => {
      if (loopState.status !== "running") {
        return {
          success: false,
          message: `Cannot pause: loop is ${loopState.status}`,
        };
      }

      shouldStop = true;
      return {
        success: true,
        message: "Loop will pause after current task",
      };
    },
  });

// ============================================================================
// LOOP_STOP
// ============================================================================

export const createLoopStopTool = (_env: Env) =>
  createPrivateTool({
    id: "LOOP_STOP",
    description: "Stop the execution loop and reset state.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      success: z.boolean(),
      finalState: z.object({
        iterations: z.number(),
        tasksCompleted: z.array(z.string()),
        tasksFailed: z.array(z.string()),
      }),
    }),
    execute: async () => {
      shouldStop = true;

      const finalState = {
        iterations: loopState.iteration,
        tasksCompleted: loopState.tasksCompleted,
        tasksFailed: loopState.tasksFailed,
      };

      // Reset state
      loopState = {
        status: "idle",
        currentTask: null,
        iteration: 0,
        maxIterations: 10,
        totalTokens: 0,
        maxTokens: 1000000,
        startedAt: null,
        lastActivity: null,
        tasksCompleted: [],
        tasksFailed: [],
        error: null,
      };

      return {
        success: true,
        finalState,
      };
    },
  });

// ============================================================================
// Export all loop tools
// ============================================================================

export const loopTools = [
  createLoopStartTool,
  createLoopStatusTool,
  createLoopPauseTool,
  createLoopStopTool,
];
