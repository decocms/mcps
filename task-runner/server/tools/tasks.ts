/**
 * Task Management Tools
 *
 * Direct task operations for agent use.
 * These wrap .beads/tasks.json for simplicity.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../shared/deco.gen.ts";
import { getWorkspace } from "./workspace.ts";

// ============================================================================
// Types
// ============================================================================

interface TaskPlan {
  summary: string;
  acceptanceCriteria: Array<{
    id: string;
    description: string;
    verifiable?: boolean;
  }>;
  subtasks: Array<{
    id: string;
    title: string;
    description: string;
    estimatedComplexity?: "trivial" | "simple" | "moderate" | "complex";
    filesToModify?: string[];
  }>;
  risks?: string[];
  estimatedComplexity?: "trivial" | "simple" | "moderate" | "complex";
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status: "open" | "in_progress" | "blocked" | "closed";
  priority?: number;
  createdAt?: string;
  updatedAt?: string;
  acceptanceCriteria?: Array<{
    id: string;
    description: string;
    completed?: boolean;
  }>;
  plan?: TaskPlan;
  planStatus?: "draft" | "approved" | "rejected";
}

interface TaskStore {
  tasks: Task[];
}

// ============================================================================
// Helpers
// ============================================================================

async function loadTasks(workspace: string): Promise<TaskStore> {
  const tasksPath = `${workspace}/.beads/tasks.json`;
  try {
    const content = await Bun.file(tasksPath).text();
    return JSON.parse(content);
  } catch {
    return { tasks: [] };
  }
}

async function saveTasks(workspace: string, store: TaskStore): Promise<void> {
  const tasksPath = `${workspace}/.beads/tasks.json`;
  await Bun.write(tasksPath, JSON.stringify(store, null, 2));
}

function generateTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// ============================================================================
// TASK_LIST
// ============================================================================

export const createTaskListTool = (_env: Env) =>
  createPrivateTool({
    id: "TASK_LIST",
    description: "List all tasks in the project",
    inputSchema: z.object({
      status: z
        .enum(["open", "in_progress", "blocked", "closed", "all"])
        .optional()
        .default("all")
        .describe("Filter by status"),
    }),
    outputSchema: z.object({
      tasks: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          status: z.string(),
          priority: z.number().optional(),
        }),
      ),
      total: z.number(),
    }),
    execute: async ({ context }) => {
      const workspace = getWorkspace();
      if (!workspace) {
        return { tasks: [], total: 0 };
      }

      const store = await loadTasks(workspace);
      let tasks = store.tasks;

      if (context.status !== "all") {
        tasks = tasks.filter((t) => t.status === context.status);
      }

      // Sort by priority (lower = higher priority)
      tasks.sort((a, b) => (a.priority ?? 5) - (b.priority ?? 5));

      return {
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
        })),
        total: tasks.length,
      };
    },
  });

// ============================================================================
// TASK_CREATE
// ============================================================================

export const createTaskCreateTool = (_env: Env) =>
  createPrivateTool({
    id: "TASK_CREATE",
    description: `Create a new task. Use this to track follow-up work.

Good for:
- Work discovered during implementation that's out of scope
- Refactoring opportunities found but not addressed
- Bugs discovered but not fixed
- Features requested but deferred`,
    inputSchema: z.object({
      title: z.string().describe("Task title (concise)"),
      description: z.string().optional().describe("Detailed description"),
      priority: z
        .number()
        .min(0)
        .max(10)
        .optional()
        .default(2)
        .describe("Priority 0-10 (0=highest, default: 2)"),
      acceptanceCriteria: z
        .array(z.string())
        .optional()
        .describe("List of acceptance criteria"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      taskId: z.string(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const workspace = getWorkspace();
      if (!workspace) {
        return { success: false, taskId: "", message: "No workspace set" };
      }

      const store = await loadTasks(workspace);
      const taskId = generateTaskId();

      const task: Task = {
        id: taskId,
        title: context.title,
        description: context.description,
        status: "open",
        priority: context.priority ?? 2,
        createdAt: new Date().toISOString(),
      };

      if (context.acceptanceCriteria) {
        task.acceptanceCriteria = context.acceptanceCriteria.map((desc, i) => ({
          id: `ac-${i + 1}`,
          description: desc,
          completed: false,
        }));
      }

      store.tasks.push(task);
      await saveTasks(workspace, store);

      return {
        success: true,
        taskId,
        message: `Created task: ${taskId} - ${context.title}`,
      };
    },
  });

// ============================================================================
// TASK_UPDATE
// ============================================================================

export const createTaskUpdateTool = (_env: Env) =>
  createPrivateTool({
    id: "TASK_UPDATE",
    description: "Update task status or details",
    inputSchema: z.object({
      id: z.string().describe("Task ID"),
      status: z
        .enum(["open", "in_progress", "blocked", "closed"])
        .optional()
        .describe("New status"),
      title: z.string().optional().describe("New title"),
      description: z.string().optional().describe("New description"),
      priority: z.number().optional().describe("New priority"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      task: z
        .object({
          id: z.string(),
          title: z.string(),
          status: z.string(),
        })
        .nullable(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const workspace = getWorkspace();
      if (!workspace) {
        return { success: false, task: null, message: "No workspace set" };
      }

      const store = await loadTasks(workspace);
      const task = store.tasks.find((t) => t.id === context.id);

      if (!task) {
        return {
          success: false,
          task: null,
          message: `Task not found: ${context.id}`,
        };
      }

      if (context.status) task.status = context.status;
      if (context.title) task.title = context.title;
      if (context.description) task.description = context.description;
      if (context.priority !== undefined) task.priority = context.priority;
      task.updatedAt = new Date().toISOString();

      await saveTasks(workspace, store);

      return {
        success: true,
        task: {
          id: task.id,
          title: task.title,
          status: task.status,
        },
        message: `Updated task: ${task.id}`,
      };
    },
  });

// ============================================================================
// TASK_GET
// ============================================================================

export const createTaskGetTool = (_env: Env) =>
  createPrivateTool({
    id: "TASK_GET",
    description: "Get full details of a specific task",
    inputSchema: z.object({
      id: z.string().describe("Task ID"),
    }),
    outputSchema: z.object({
      task: z
        .object({
          id: z.string(),
          title: z.string(),
          description: z.string().optional(),
          status: z.string(),
          priority: z.number().optional(),
          createdAt: z.string().optional(),
          updatedAt: z.string().optional(),
          acceptanceCriteria: z
            .array(
              z.object({
                id: z.string(),
                description: z.string(),
                completed: z.boolean().optional(),
              }),
            )
            .optional(),
        })
        .nullable(),
    }),
    execute: async ({ context }) => {
      const workspace = getWorkspace();
      if (!workspace) {
        return { task: null };
      }

      const store = await loadTasks(workspace);
      const task = store.tasks.find((t) => t.id === context.id);

      return { task: task || null };
    },
  });

// ============================================================================
// TASK_SET_PLAN - Save a plan generated by the AI agent
// The agent analyzes the task, explores code, then calls this to save the plan
// Inspired by: https://github.com/JeremyKalmus/parade (discover → approve-spec → run)
// ============================================================================

export const createTaskSetPlanTool = (_env: Env) =>
  createPrivateTool({
    id: "TASK_SET_PLAN",
    description: `Save a detailed plan for a task.

Call this AFTER you have analyzed the task and codebase to save your plan.
The plan should include:
1. A clear summary of what needs to be done
2. Specific, verifiable acceptance criteria
3. Subtasks broken down by complexity
4. Any risks or considerations

The user will review and approve the plan before execution begins.`,
    inputSchema: z.object({
      workspace: z
        .string()
        .describe("Absolute path to the workspace/project directory"),
      taskId: z.string().describe("Task ID to set plan for"),
      plan: z.object({
        summary: z
          .string()
          .describe("1-2 sentence summary of the implementation approach"),
        acceptanceCriteria: z
          .array(
            z.object({
              id: z.string().describe("Unique ID like 'ac-1'"),
              description: z.string().describe("Clear, verifiable criterion"),
              verifiable: z
                .boolean()
                .describe("Can this be objectively verified?"),
            }),
          )
          .describe("Specific success criteria - be concrete, not generic"),
        subtasks: z
          .array(
            z.object({
              id: z.string().describe("Unique ID like 'st-1'"),
              title: z.string().describe("Short title for the subtask"),
              description: z.string().describe("What needs to be done"),
              estimatedComplexity: z.enum([
                "trivial",
                "simple",
                "moderate",
                "complex",
              ]),
              filesToModify: z
                .array(z.string())
                .optional()
                .describe("Files that will likely be modified"),
            }),
          )
          .describe("Breakdown of work into smaller steps"),
        risks: z
          .array(z.string())
          .optional()
          .describe("Potential issues or blockers"),
        estimatedComplexity: z
          .enum(["trivial", "simple", "moderate", "complex"])
          .describe("Overall task complexity"),
      }),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      taskId: z.string(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const { workspace, taskId, plan } = context;

      // Load the task
      const store = await loadTasks(workspace);
      const taskIndex = store.tasks.findIndex((t) => t.id === taskId);

      if (taskIndex === -1) {
        throw new Error(`Task not found: ${taskId}`);
      }

      const task = store.tasks[taskIndex];

      // Save plan to the task
      store.tasks[taskIndex] = {
        ...task,
        plan,
        planStatus: "draft" as const,
        updatedAt: new Date().toISOString(),
      };

      await saveTasks(workspace, store);

      return {
        success: true,
        taskId,
        message: `Plan saved with ${plan.acceptanceCriteria.length} acceptance criteria and ${plan.subtasks.length} subtasks. User will review and approve.`,
      };
    },
  });

// ============================================================================
// TASK_APPROVE_PLAN - Approve a task plan for execution
// ============================================================================

export const createTaskApprovePlanTool = (_env: Env) =>
  createPrivateTool({
    id: "TASK_APPROVE_PLAN",
    description: `Approve or modify a task plan before execution.

After reviewing the generated plan, use this to:
1. Approve the plan as-is
2. Modify acceptance criteria
3. Add/remove subtasks
4. Reject the plan for re-planning`,
    inputSchema: z.object({
      taskId: z.string().describe("Task ID"),
      action: z
        .enum(["approve", "reject"])
        .describe("Approve or reject the plan"),
      modifications: z
        .object({
          acceptanceCriteria: z
            .array(
              z.object({
                id: z.string(),
                description: z.string(),
              }),
            )
            .optional()
            .describe("Modified acceptance criteria"),
          subtasks: z
            .array(
              z.object({
                id: z.string(),
                title: z.string(),
                description: z.string(),
              }),
            )
            .optional()
            .describe("Modified subtasks"),
        })
        .optional(),
      reason: z.string().optional().describe("Reason for rejection"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      taskId: z.string(),
      planStatus: z.enum(["draft", "approved", "rejected"]),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const { taskId, action, modifications, reason } = context;
      const workspace = getWorkspace();
      if (!workspace) {
        throw new Error("No workspace set");
      }

      const store = await loadTasks(workspace);
      const taskIndex = store.tasks.findIndex((t) => t.id === taskId);

      if (taskIndex === -1) {
        return {
          success: false,
          taskId,
          planStatus: "draft" as const,
          message: "Task not found",
        };
      }

      const task = store.tasks[taskIndex] as Task & {
        plan?: unknown;
        planStatus?: string;
      };

      if (action === "approve") {
        // Apply modifications if provided
        if (modifications?.acceptanceCriteria && task.plan) {
          (task.plan as { acceptanceCriteria: unknown[] }).acceptanceCriteria =
            modifications.acceptanceCriteria;
        }
        if (modifications?.subtasks && task.plan) {
          (task.plan as { subtasks: unknown[] }).subtasks =
            modifications.subtasks;
        }

        task.planStatus = "approved";
        task.acceptanceCriteria = (
          task.plan as {
            acceptanceCriteria: Array<{ id: string; description: string }>;
          }
        )?.acceptanceCriteria?.map((ac) => ({
          id: ac.id,
          description: ac.description,
          completed: false,
        }));
      } else {
        task.planStatus = "rejected";
      }

      task.updatedAt = new Date().toISOString();
      store.tasks[taskIndex] = task;
      await saveTasks(workspace, store);

      return {
        success: true,
        taskId,
        planStatus: task.planStatus as "draft" | "approved" | "rejected",
        message:
          action === "approve"
            ? "Plan approved. Task is ready for execution."
            : `Plan rejected: ${reason || "No reason provided"}`,
      };
    },
  });

// ============================================================================
// Export all task tools
// ============================================================================

export const taskTools = [
  createTaskListTool,
  createTaskCreateTool,
  createTaskUpdateTool,
  createTaskGetTool,
  createTaskSetPlanTool,
  createTaskApprovePlanTool,
];
