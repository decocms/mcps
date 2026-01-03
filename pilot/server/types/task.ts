/**
 * MCP Tasks Specification Types
 *
 * Implements the MCP Tasks protocol (draft 2025-11-25).
 * @see https://modelcontextprotocol.io/specification/draft/basic/utilities/tasks
 */

import { z } from "zod";

/**
 * Task Status - MCP compliant states
 */
export const TaskStatusSchema = z.enum([
  "working", // Request is currently being processed
  "input_required", // Receiver needs input from requestor
  "completed", // Successfully finished, results available
  "failed", // Did not complete successfully
  "cancelled", // Cancelled before completion
]);

export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/**
 * Step Result - Tracks individual step execution
 */
export const StepResultSchema = z.object({
  stepId: z.string(),
  stepName: z.string(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  status: z.enum(["pending", "working", "completed", "failed", "skipped"]),
  output: z.unknown().optional(),
  error: z.string().optional(),
  progressMessages: z
    .array(
      z.object({
        timestamp: z.string(),
        message: z.string(),
      }),
    )
    .default([]),
});

export type StepResult = z.infer<typeof StepResultSchema>;

/**
 * Task - MCP compliant task with workflow execution context
 */
export const TaskSchema = z.object({
  // MCP Task fields
  taskId: z.string(),
  status: TaskStatusSchema,
  statusMessage: z.string().optional(),
  createdAt: z.string(),
  lastUpdatedAt: z.string(),
  ttl: z.number().optional(),
  pollInterval: z.number().optional(),

  // Workflow execution context
  workflowId: z.string(),
  workflowInput: z.record(z.string(), z.unknown()),
  currentStepIndex: z.number().default(0),
  stepResults: z.array(StepResultSchema).default([]),

  // Request context
  source: z.string(),
  chatId: z.string().optional(),

  // Original request info
  originalRequest: z
    .object({
      method: z.string(),
      params: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),

  // Final result
  result: z.unknown().optional(),
  error: z.string().optional(),
});

export type Task = z.infer<typeof TaskSchema>;

/**
 * Create Task Parameters - Sent with task-augmented requests
 */
export const CreateTaskParamsSchema = z.object({
  ttl: z.number().optional(),
});

export type CreateTaskParams = z.infer<typeof CreateTaskParamsSchema>;

/**
 * Create Task Result - Returned when a task is created
 */
export const CreateTaskResultSchema = z.object({
  taskId: z.string(),
  status: TaskStatusSchema,
  createdAt: z.string(),
  ttl: z.number().optional(),
  pollInterval: z.number().optional(),
});

export type CreateTaskResult = z.infer<typeof CreateTaskResultSchema>;

/**
 * Task Get Result - Full task state
 */
export const TaskGetResultSchema = TaskSchema.pick({
  taskId: true,
  status: true,
  statusMessage: true,
  createdAt: true,
  lastUpdatedAt: true,
  ttl: true,
  pollInterval: true,
});

export type TaskGetResult = z.infer<typeof TaskGetResultSchema>;

/**
 * Task List Result
 */
export const TaskListResultSchema = z.object({
  tasks: z.array(TaskGetResultSchema),
  nextCursor: z.string().optional(),
});

export type TaskListResult = z.infer<typeof TaskListResultSchema>;

/**
 * Progress notification data
 */
export const TaskProgressSchema = z.object({
  taskId: z.string(),
  stepName: z.string().optional(),
  message: z.string(),
  progress: z.number().optional(), // 0-100
  total: z.number().optional(),
  current: z.number().optional(),
});

export type TaskProgress = z.infer<typeof TaskProgressSchema>;

/**
 * Generate a unique task ID
 */
export function generateTaskId(): string {
  const now = new Date();
  const date = now.toISOString().split("T")[0];
  const time = now.toTimeString().split(" ")[0].replace(/:/g, "");
  const rand = Math.random().toString(36).substring(2, 8);
  return `task_${date}_${time}_${rand}`;
}

/**
 * Create a new task
 */
export function createTask(
  workflowId: string,
  workflowInput: Record<string, unknown>,
  source: string,
  options: {
    chatId?: string;
    ttl?: number;
    originalRequest?: { method: string; params?: Record<string, unknown> };
  } = {},
): Task {
  const now = new Date().toISOString();
  return {
    taskId: generateTaskId(),
    status: "working",
    createdAt: now,
    lastUpdatedAt: now,
    ttl: options.ttl ?? 60000 * 30, // 30 minutes default
    pollInterval: 1000, // 1 second
    workflowId,
    workflowInput,
    currentStepIndex: 0,
    stepResults: [],
    source,
    chatId: options.chatId,
    originalRequest: options.originalRequest,
  };
}
