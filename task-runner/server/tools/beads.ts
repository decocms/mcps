/**
 * Beads CLI Integration Tools
 *
 * Tools that wrap the `bd` CLI for task management.
 * Reference: https://github.com/steveyegge/beads
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../shared/deco.gen.ts";
import { getWorkspace } from "./workspace.ts";

// ============================================================================
// Helper: Run bd command
// ============================================================================

interface BdResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  json?: unknown;
}

async function runBd(args: string[], cwd?: string): Promise<BdResult> {
  const workspace = cwd ?? getWorkspace();

  const proc = Bun.spawn(["bd", ...args], {
    cwd: workspace,
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  // Try to parse JSON if --json flag was used
  let json: unknown = undefined;
  if (args.includes("--json")) {
    try {
      json = JSON.parse(stdout);
    } catch {
      // Not valid JSON, that's fine
    }
  }

  return { stdout, stderr, exitCode, json };
}

// ============================================================================
// Task Schema (from Beads)
// ============================================================================

const TaskSchema = z.object({
  id: z.string().describe("Task ID (e.g., bd-abc or bd-abc.1)"),
  title: z.string().describe("Task title"),
  type: z.enum(["epic", "story", "task", "bug"]).optional(),
  status: z.enum(["open", "in_progress", "blocked", "closed"]).optional(),
  priority: z.number().optional().describe("Priority (0=highest)"),
  description: z.string().optional(),
  blockedBy: z.array(z.string()).optional().describe("IDs of blocking tasks"),
  labels: z.array(z.string()).optional(),
  createdAt: z.string().optional(),
  closedAt: z.string().optional(),
  closeReason: z.string().optional(),
});

type Task = z.infer<typeof TaskSchema>;

// ============================================================================
// BEADS_INIT
// ============================================================================

export const createBeadsInitTool = (_env: Env) =>
  createPrivateTool({
    id: "BEADS_INIT",
    description:
      "Initialize Beads in the current workspace. Creates .beads/ directory for task storage. Equivalent to `bd init`.",
    inputSchema: z.object({
      prefix: z
        .string()
        .optional()
        .describe("Custom prefix for task IDs (default: bd)"),
      quiet: z.boolean().optional().describe("Suppress output"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
      workspace: z.string(),
    }),
    execute: async ({ context }) => {
      const args = ["init"];
      if (context.prefix) args.push("--prefix", context.prefix);
      if (context.quiet) args.push("--quiet");

      const result = await runBd(args);

      if (result.exitCode !== 0) {
        throw new Error(`bd init failed: ${result.stderr || result.stdout}`);
      }

      return {
        success: true,
        message: result.stdout.trim() || "Beads initialized",
        workspace: getWorkspace(),
      };
    },
  });

// ============================================================================
// BEADS_READY
// ============================================================================

export const createBeadsReadyTool = (_env: Env) =>
  createPrivateTool({
    id: "BEADS_READY",
    description:
      "Get tasks that are ready to work on (no unmet dependencies). Equivalent to `bd ready --json`.",
    inputSchema: z.object({
      limit: z
        .number()
        .optional()
        .describe("Maximum number of tasks to return"),
    }),
    outputSchema: z.object({
      tasks: z.array(TaskSchema),
      count: z.number(),
    }),
    execute: async ({ context }) => {
      const args = ["ready", "--json"];
      if (context.limit) args.push("--limit", String(context.limit));

      const result = await runBd(args);

      if (result.exitCode !== 0) {
        throw new Error(`bd ready failed: ${result.stderr || result.stdout}`);
      }

      const tasks = (result.json as Task[]) ?? [];

      return {
        tasks,
        count: tasks.length,
      };
    },
  });

// ============================================================================
// BEADS_CREATE
// ============================================================================

export const createBeadsCreateTool = (_env: Env) =>
  createPrivateTool({
    id: "BEADS_CREATE",
    description:
      "Create a new task in Beads. Equivalent to `bd create`. Returns the created task ID.",
    inputSchema: z.object({
      title: z.string().describe("Task title"),
      type: z
        .enum(["epic", "story", "task", "bug"])
        .optional()
        .describe("Task type (default: task)"),
      priority: z
        .number()
        .min(0)
        .max(10)
        .optional()
        .describe("Priority 0-10 (0=highest, default: 5)"),
      description: z.string().optional().describe("Task description"),
      epic: z.string().optional().describe("Parent epic ID"),
      blockedBy: z
        .array(z.string())
        .optional()
        .describe("IDs of tasks that block this one"),
      labels: z.array(z.string()).optional().describe("Labels to add"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      taskId: z.string().describe("Created task ID"),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const args = ["create", context.title, "--json"];

      if (context.type) args.push("-t", context.type);
      if (context.priority !== undefined)
        args.push("-p", String(context.priority));
      if (context.description) args.push("-d", context.description);
      if (context.epic) args.push("--epic", context.epic);
      if (context.blockedBy?.length) {
        args.push("--blocked-by", context.blockedBy.join(","));
      }
      if (context.labels?.length) {
        args.push("--labels", context.labels.join(","));
      }

      const result = await runBd(args);

      if (result.exitCode !== 0) {
        throw new Error(`bd create failed: ${result.stderr || result.stdout}`);
      }

      // Parse the created task ID from output
      const created = result.json as { id?: string } | undefined;
      const taskId =
        created?.id ?? result.stdout.match(/bd-[\w.]+/)?.[0] ?? "unknown";

      return {
        success: true,
        taskId,
        message: `Created task: ${taskId}`,
      };
    },
  });

// ============================================================================
// BEADS_UPDATE
// ============================================================================

export const createBeadsUpdateTool = (_env: Env) =>
  createPrivateTool({
    id: "BEADS_UPDATE",
    description:
      "Update an existing task in Beads. Equivalent to `bd update`. Use this to change status, add notes, etc.",
    inputSchema: z.object({
      taskId: z.string().describe("Task ID to update"),
      status: z
        .enum(["open", "in_progress", "blocked", "closed"])
        .optional()
        .describe("New status"),
      title: z.string().optional().describe("New title"),
      description: z.string().optional().describe("New description"),
      priority: z.number().optional().describe("New priority"),
      notes: z.string().optional().describe("Notes to add"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      taskId: z.string(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const args = ["update", context.taskId];

      if (context.status) args.push("--status", context.status);
      if (context.title) args.push("--title", context.title);
      if (context.description) args.push("--description", context.description);
      if (context.priority !== undefined)
        args.push("--priority", String(context.priority));
      if (context.notes) args.push("--notes", context.notes);

      const result = await runBd(args);

      if (result.exitCode !== 0) {
        throw new Error(`bd update failed: ${result.stderr || result.stdout}`);
      }

      return {
        success: true,
        taskId: context.taskId,
        message: result.stdout.trim() || `Updated task: ${context.taskId}`,
      };
    },
  });

// ============================================================================
// BEADS_CLOSE
// ============================================================================

export const createBeadsCloseTool = (_env: Env) =>
  createPrivateTool({
    id: "BEADS_CLOSE",
    description:
      "Close one or more tasks in Beads. Equivalent to `bd close`. Use after task completion.",
    inputSchema: z.object({
      taskIds: z.array(z.string()).min(1).describe("Task IDs to close"),
      reason: z
        .string()
        .optional()
        .describe("Reason for closing (default: Completed)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      closedTasks: z.array(z.string()),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const args = ["close", ...context.taskIds];
      if (context.reason) args.push("--reason", context.reason);

      const result = await runBd(args);

      if (result.exitCode !== 0) {
        throw new Error(`bd close failed: ${result.stderr || result.stdout}`);
      }

      return {
        success: true,
        closedTasks: context.taskIds,
        message:
          result.stdout.trim() || `Closed: ${context.taskIds.join(", ")}`,
      };
    },
  });

// ============================================================================
// BEADS_SYNC
// ============================================================================

export const createBeadsSyncTool = (_env: Env) =>
  createPrivateTool({
    id: "BEADS_SYNC",
    description:
      "Force immediate sync of Beads database. Exports to JSONL, commits to git, pulls/pushes. Equivalent to `bd sync`.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async () => {
      const result = await runBd(["sync"]);

      if (result.exitCode !== 0) {
        throw new Error(`bd sync failed: ${result.stderr || result.stdout}`);
      }

      return {
        success: true,
        message: result.stdout.trim() || "Sync complete",
      };
    },
  });

// ============================================================================
// BEADS_LIST
// ============================================================================

export const createBeadsListTool = (_env: Env) =>
  createPrivateTool({
    id: "BEADS_LIST",
    description:
      "List all tasks in Beads. Equivalent to `bd list`. Returns tasks with their current state.",
    inputSchema: z.object({
      tree: z.boolean().optional().describe("Show hierarchical tree view"),
      status: z
        .enum(["open", "in_progress", "blocked", "closed"])
        .optional()
        .describe("Filter by status"),
      epic: z.string().optional().describe("Filter by epic ID"),
    }),
    outputSchema: z.object({
      tasks: z.array(TaskSchema),
      count: z.number(),
    }),
    execute: async ({ context }) => {
      const args = ["list", "--json"];
      if (context.tree) args.push("--tree");
      if (context.status) args.push("--status", context.status);
      if (context.epic) args.push("--epic", context.epic);

      const result = await runBd(args);

      if (result.exitCode !== 0) {
        throw new Error(`bd list failed: ${result.stderr || result.stdout}`);
      }

      const tasks = (result.json as Task[]) ?? [];

      return {
        tasks,
        count: tasks.length,
      };
    },
  });

// ============================================================================
// BEADS_SHOW
// ============================================================================

export const createBeadsShowTool = (_env: Env) =>
  createPrivateTool({
    id: "BEADS_SHOW",
    description:
      "Show details of a specific task. Equivalent to `bd show`. Returns full task information including audit trail.",
    inputSchema: z.object({
      taskId: z.string().describe("Task ID to show"),
    }),
    outputSchema: z.object({
      task: TaskSchema.nullable(),
    }),
    execute: async ({ context }) => {
      const result = await runBd(["show", context.taskId, "--json"]);

      if (result.exitCode !== 0) {
        throw new Error(`bd show failed: ${result.stderr || result.stdout}`);
      }

      const task = result.json as Task | null;

      return { task };
    },
  });

// ============================================================================
// BEADS_DELETE - Delete a task
// ============================================================================

export const createBeadsDeleteTool = (_env: Env) =>
  createPrivateTool({
    id: "BEADS_DELETE",
    description: "Delete a task permanently from the task list",
    inputSchema: z.object({
      taskId: z.string().describe("The task ID to delete"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const workspace = getWorkspace();
      const tasksPath = `${workspace}/.beads/tasks.json`;

      try {
        const content = await Bun.file(tasksPath).text();
        const data = JSON.parse(content) as { tasks: Task[] };

        const originalCount = data.tasks.length;
        data.tasks = data.tasks.filter((t) => t.id !== context.taskId);

        if (data.tasks.length === originalCount) {
          return {
            success: false,
            message: `Task not found: ${context.taskId}`,
          };
        }

        await Bun.write(tasksPath, JSON.stringify(data, null, 2));

        return {
          success: true,
          message: `Deleted task ${context.taskId}`,
        };
      } catch (error) {
        throw new Error(
          `Failed to delete task: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  });

// ============================================================================
// BEADS_CLEANUP - Reset orphaned in_progress tasks to open
// ============================================================================

export const createBeadsCleanupTool = (_env: Env) =>
  createPrivateTool({
    id: "BEADS_CLEANUP",
    description:
      "Reset tasks that are stuck in 'in_progress' state but have no running agent",
    inputSchema: z.object({}),
    outputSchema: z.object({
      cleaned: z.number(),
      message: z.string(),
    }),
    execute: async () => {
      const workspace = getWorkspace();
      const tasksPath = `${workspace}/.beads/tasks.json`;
      const sessionsPath = `${workspace}/.beads/sessions.json`;

      try {
        // Load tasks
        const tasksContent = await Bun.file(tasksPath).text();
        const tasksData = JSON.parse(tasksContent) as { tasks: Task[] };

        // Load sessions
        let runningSessions: string[] = [];
        try {
          const sessionsContent = await Bun.file(sessionsPath).text();
          const sessionsData = JSON.parse(sessionsContent) as {
            sessions: { taskId: string; status: string }[];
          };
          runningSessions = sessionsData.sessions
            .filter((s) => s.status === "running")
            .map((s) => s.taskId);
        } catch {
          // No sessions file, that's fine
        }

        // Reset orphaned in_progress tasks
        let cleaned = 0;
        for (const task of tasksData.tasks) {
          if (
            task.status === "in_progress" &&
            !runningSessions.includes(task.id)
          ) {
            task.status = "open";
            // Add updatedAt even though it's not in the strict schema
            (task as Record<string, unknown>).updatedAt =
              new Date().toISOString();
            cleaned++;
          }
        }

        if (cleaned > 0) {
          await Bun.write(tasksPath, JSON.stringify(tasksData, null, 2));
        }

        return {
          cleaned,
          message:
            cleaned > 0
              ? `Reset ${cleaned} orphaned task(s) to open`
              : "No orphaned tasks found",
        };
      } catch (error) {
        throw new Error(
          `Failed to cleanup tasks: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  });

// ============================================================================
// Export all beads tools
// ============================================================================

export const beadsTools = [
  createBeadsInitTool,
  createBeadsReadyTool,
  createBeadsCreateTool,
  createBeadsUpdateTool,
  createBeadsCloseTool,
  createBeadsSyncTool,
  createBeadsListTool,
  createBeadsShowTool,
  createBeadsDeleteTool,
  createBeadsCleanupTool,
];
