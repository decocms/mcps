/**
 * Task Storage
 *
 * File-based task persistence in ~/Projects/tasks/
 * Each task is a separate JSON file for easy inspection and debugging.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  type Task,
  TaskSchema,
  type StepResult,
  type TaskStatus,
} from "../types/task.ts";

/**
 * Expand ~ to home directory
 */
function expandPath(p: string): string {
  if (p.startsWith("~/")) {
    return path.join(process.env.HOME || "/tmp", p.slice(2));
  }
  return p;
}

/**
 * Get tasks directory from environment or default
 */
function getTasksDir(): string {
  const envDir = process.env.TASKS_DIR;
  if (envDir) {
    return expandPath(envDir);
  }
  return path.join(process.env.HOME || "/tmp", "Projects", "tasks");
}

// Tasks directory - configurable via TASKS_DIR env var
const TASKS_DIR = getTasksDir();

// Ensure directory exists
function ensureDir() {
  if (!fs.existsSync(TASKS_DIR)) {
    fs.mkdirSync(TASKS_DIR, { recursive: true });
  }
}

/**
 * Get the file path for a task
 */
function getTaskPath(taskId: string): string {
  return path.join(TASKS_DIR, `${taskId}.json`);
}

/**
 * Save a task to disk
 */
export function saveTask(task: Task): void {
  ensureDir();
  const filePath = getTaskPath(task.taskId);
  fs.writeFileSync(filePath, JSON.stringify(task, null, 2));
}

/**
 * Load a task from disk
 */
export function loadTask(taskId: string): Task | null {
  const filePath = getTaskPath(taskId);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content);
    return TaskSchema.parse(parsed);
  } catch (error) {
    console.error(`[TaskStorage] Failed to load task ${taskId}:`, error);
    return null;
  }
}

/**
 * Delete a task from disk
 */
export function deleteTask(taskId: string): boolean {
  const filePath = getTaskPath(taskId);
  if (!fs.existsSync(filePath)) {
    return false;
  }

  try {
    fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * List all tasks
 */
export function listTasks(
  options: {
    limit?: number;
    status?: TaskStatus;
    source?: string;
    cursor?: string;
  } = {},
): { tasks: Task[]; nextCursor?: string } {
  ensureDir();

  const files = fs
    .readdirSync(TASKS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse(); // Most recent first (by taskId which includes timestamp)

  const tasks: Task[] = [];
  let foundCursor = !options.cursor;
  let nextCursor: string | undefined;

  const limit = options.limit ?? 50;

  for (const file of files) {
    const taskId = file.replace(".json", "");

    // Handle cursor-based pagination
    if (!foundCursor) {
      if (taskId === options.cursor) {
        foundCursor = true;
      }
      continue;
    }

    // Load and filter
    const task = loadTask(taskId);
    if (!task) continue;

    if (options.status && task.status !== options.status) continue;
    if (options.source && task.source !== options.source) continue;

    tasks.push(task);

    // Check limit
    if (tasks.length >= limit) {
      // Set next cursor to last task's ID
      const lastFile = files[files.indexOf(file) + 1];
      if (lastFile) {
        nextCursor = lastFile.replace(".json", "");
      }
      break;
    }
  }

  return { tasks, nextCursor };
}

/**
 * Update a task's status
 */
export function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  statusMessage?: string,
): Task | null {
  const task = loadTask(taskId);
  if (!task) return null;

  task.status = status;
  task.lastUpdatedAt = new Date().toISOString();
  if (statusMessage) {
    task.statusMessage = statusMessage;
  }

  saveTask(task);
  return task;
}

/**
 * Update task's current step
 */
export function updateTaskStep(
  taskId: string,
  stepIndex: number,
  stepResult: StepResult,
): Task | null {
  const task = loadTask(taskId);
  if (!task) return null;

  task.currentStepIndex = stepIndex;
  task.lastUpdatedAt = new Date().toISOString();

  // Update or add step result
  const existingIndex = task.stepResults.findIndex(
    (r) => r.stepId === stepResult.stepId,
  );
  if (existingIndex >= 0) {
    task.stepResults[existingIndex] = stepResult;
  } else {
    task.stepResults.push(stepResult);
  }

  saveTask(task);
  return task;
}

/**
 * Add progress message to current step
 */
export function addStepProgress(
  taskId: string,
  stepName: string,
  message: string,
): Task | null {
  const task = loadTask(taskId);
  if (!task) return null;

  const stepResult = task.stepResults.find((r) => r.stepName === stepName);
  if (stepResult) {
    stepResult.progressMessages.push({
      timestamp: new Date().toISOString(),
      message,
    });
    task.lastUpdatedAt = new Date().toISOString();
    saveTask(task);
  }

  return task;
}

/**
 * Complete a task with result
 */
export function completeTask(taskId: string, result: unknown): Task | null {
  const task = loadTask(taskId);
  if (!task) return null;

  task.status = "completed";
  task.lastUpdatedAt = new Date().toISOString();
  task.result = result;

  saveTask(task);
  return task;
}

/**
 * Fail a task with error
 */
export function failTask(taskId: string, error: string): Task | null {
  const task = loadTask(taskId);
  if (!task) return null;

  task.status = "failed";
  task.lastUpdatedAt = new Date().toISOString();
  task.error = error;

  saveTask(task);
  return task;
}

/**
 * Cancel a task
 */
export function cancelTask(taskId: string): Task | null {
  const task = loadTask(taskId);
  if (!task) return null;

  // Can only cancel if not in terminal state
  if (task.status === "completed" || task.status === "failed") {
    return null;
  }

  task.status = "cancelled";
  task.lastUpdatedAt = new Date().toISOString();

  saveTask(task);
  return task;
}

/**
 * Cleanup expired tasks
 */
export function cleanupExpiredTasks(): number {
  ensureDir();
  const now = Date.now();
  let cleaned = 0;

  const files = fs.readdirSync(TASKS_DIR).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    const task = loadTask(file.replace(".json", ""));
    if (!task) continue;

    // Check if expired
    if (task.ttl) {
      const createdAt = new Date(task.createdAt).getTime();
      if (now - createdAt > task.ttl) {
        deleteTask(task.taskId);
        cleaned++;
      }
    }
  }

  return cleaned;
}

/**
 * Get task statistics
 */
export function getTaskStats(): {
  total: number;
  byStatus: Record<TaskStatus, number>;
  bySource: Record<string, number>;
} {
  const { tasks } = listTasks({ limit: 1000 });

  const byStatus: Record<TaskStatus, number> = {
    working: 0,
    input_required: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  };

  const bySource: Record<string, number> = {};

  for (const task of tasks) {
    byStatus[task.status]++;
    bySource[task.source] = (bySource[task.source] || 0) + 1;
  }

  return {
    total: tasks.length,
    byStatus,
    bySource,
  };
}
