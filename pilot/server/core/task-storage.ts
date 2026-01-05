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
 * IMPORTANT: Preserves existing progressMessages that were accumulated during execution
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
    // PRESERVE existing progressMessages - merge with new ones
    const existingProgress =
      task.stepResults[existingIndex].progressMessages || [];
    const newProgress = stepResult.progressMessages || [];

    // Merge: existing messages + any new messages not already present
    const mergedProgress = [...existingProgress];
    for (const msg of newProgress) {
      // Avoid duplicates by checking timestamp + message
      const isDuplicate = existingProgress.some(
        (e) => e.timestamp === msg.timestamp && e.message === msg.message,
      );
      if (!isDuplicate) {
        mergedProgress.push(msg);
      }
    }

    task.stepResults[existingIndex] = {
      ...stepResult,
      progressMessages: mergedProgress,
    };
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
  if (!task) {
    console.error(`[task-storage] addStepProgress: Task not found: ${taskId}`);
    return null;
  }

  // Find existing step by name
  let stepResult = task.stepResults.find((r) => r.stepName === stepName);

  // If step doesn't exist but we have steps, use the current step
  if (!stepResult && task.stepResults.length > 0) {
    stepResult = task.stepResults[task.currentStepIndex] || task.stepResults[0];
    console.error(
      `[task-storage] Step "${stepName}" not found, using "${stepResult.stepName}" instead`,
    );
  }

  // If we have a step, add progress to it
  if (stepResult) {
    if (!stepResult.progressMessages) {
      stepResult.progressMessages = [];
    }
    stepResult.progressMessages.push({
      timestamp: new Date().toISOString(),
      message,
    });
    task.lastUpdatedAt = new Date().toISOString();
    saveTask(task);
    console.error(
      `[task-storage] Saved progress to step "${stepResult.stepName}": ${message.slice(0, 50)}...`,
    );
    return task;
  }

  // No steps yet - log to console but we can't persist
  console.error(
    `[task-storage] No step to log progress (${task.stepResults.length} steps): ${stepName}: ${message}`,
  );
  return null;
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

/**
 * Task summary for router context (lightweight)
 */
export interface TaskSummary {
  id: string;
  workflow: string;
  status: TaskStatus;
  createdAt: string;
  currentStep?: string;
  stepProgress?: string; // e.g., "3/7"
}

/**
 * Get lightweight task index for router context
 */
export function getTaskIndex(limit = 20): TaskSummary[] {
  const { tasks } = listTasks({ limit });

  return tasks.map((t) => {
    const currentStep = t.stepResults[t.currentStepIndex]?.stepName;
    const totalSteps = t.stepResults.length;

    return {
      id: t.taskId,
      workflow: t.workflowId,
      status: t.status,
      createdAt: t.createdAt,
      currentStep,
      stepProgress:
        totalSteps > 0 ? `${t.currentStepIndex + 1}/${totalSteps}` : undefined,
    };
  });
}

/**
 * Get currently running tasks with more detail
 */
export function getRunningTasks(): {
  id: string;
  workflow: string;
  currentStep: string;
  stepIndex: number;
  totalSteps: number;
  lastProgress?: string;
  startedAt: string;
}[] {
  const { tasks } = listTasks({ status: "working", limit: 50 });

  return tasks.map((t) => {
    const currentStepResult = t.stepResults[t.currentStepIndex];
    const lastProgress =
      currentStepResult?.progressMessages?.slice(-1)[0]?.message;

    return {
      id: t.taskId,
      workflow: t.workflowId,
      currentStep: currentStepResult?.stepName || "starting",
      stepIndex: t.currentStepIndex,
      totalSteps: t.stepResults.length,
      lastProgress,
      startedAt: t.createdAt,
    };
  });
}

// ============================================================================
// Thread Continuation (Simple Conversation Model)
// ============================================================================

/** Default thread timeout: 5 minutes */
const THREAD_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Get the most recent task from this source/chatId that can be continued as a thread.
 *
 * A task is continuable if:
 * - It's from the same source and chatId
 * - It was last updated within THREAD_TIMEOUT_MS
 * - It's completed (not still running or failed)
 * - It's not marked as threadClosed
 *
 * @returns The continuable task, or null if none found
 */
export function getRecentThread(
  source: string,
  chatId?: string,
  timeoutMs: number = THREAD_TIMEOUT_MS,
): Task | null {
  const now = Date.now();
  const { tasks } = listTasks({ limit: 10, source });

  for (const task of tasks) {
    // Must match chatId
    if (task.chatId !== chatId) continue;

    // Must be completed (not still running, failed, or cancelled)
    if (task.status !== "completed") continue;

    // Must not be explicitly closed
    if (task.threadClosed) continue;

    // Must be recent
    const lastUpdated = new Date(task.lastUpdatedAt).getTime();
    const age = now - lastUpdated;

    if (age <= timeoutMs) {
      console.error(
        `[task-storage] Found continuable thread: ${task.taskId} (age: ${Math.round(age / 1000)}s)`,
      );
      return task;
    }
  }

  return null;
}

/**
 * Close the current thread for a source/chatId.
 * This marks the most recent task as threadClosed so the next message starts fresh.
 *
 * @returns The closed task, or null if no active thread found
 */
export function closeThread(source: string, chatId?: string): Task | null {
  const { tasks } = listTasks({ limit: 10, source });

  for (const task of tasks) {
    if (task.chatId !== chatId) continue;
    if (task.status !== "completed") continue;
    if (task.threadClosed) continue;

    // Found the active thread - close it
    task.threadClosed = true;
    task.lastUpdatedAt = new Date().toISOString();
    saveTask(task);

    console.error(`[task-storage] Closed thread: ${task.taskId}`);
    return task;
  }

  return null;
}
