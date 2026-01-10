/**
 * Task Manager
 *
 * Manages task lifecycle, persistence, and querying.
 * Tasks are stored in memory with optional file persistence.
 */

export interface TaskProgress {
  timestamp: string;
  message: string;
}

export interface Task {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "pending" | "in_progress" | "completed" | "error" | "cancelled";
  source: string;
  chatId?: string;
  userMessage: string;
  response?: string;
  progress: TaskProgress[];
  error?: string;
  toolsUsed: string[];
  durationMs?: number;
}

// In-memory store (can be persisted to file or database)
const tasks: Map<string, Task> = new Map();
const MAX_TASKS = 100;

/**
 * Generate a unique task ID
 */
function generateTaskId(): string {
  const now = new Date();
  const date = now.toISOString().split("T")[0];
  const time = now.toTimeString().split(" ")[0].replace(/:/g, "");
  const rand = Math.random().toString(36).substring(2, 6);
  return `task_${date}_${time}_${rand}`;
}

/**
 * Create a new task
 */
export function createTask(
  userMessage: string,
  source: string,
  chatId?: string,
): Task {
  const task: Task = {
    id: generateTaskId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "pending",
    source,
    chatId,
    userMessage: userMessage.slice(0, 500),
    progress: [],
    toolsUsed: [],
  };

  // Enforce max tasks limit
  if (tasks.size >= MAX_TASKS) {
    // Remove oldest completed/error tasks first
    const sorted = Array.from(tasks.values())
      .filter((t) => t.status === "completed" || t.status === "error")
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );

    for (const oldTask of sorted.slice(0, 10)) {
      tasks.delete(oldTask.id);
    }
  }

  tasks.set(task.id, task);
  return task;
}

/**
 * Get a task by ID
 */
export function getTask(taskId: string): Task | null {
  return tasks.get(taskId) || null;
}

/**
 * Update task status
 */
export function updateTaskStatus(
  taskId: string,
  status: Task["status"],
  response?: string,
  error?: string,
): void {
  const task = tasks.get(taskId);
  if (!task) return;

  task.status = status;
  task.updatedAt = new Date().toISOString();

  if (response) task.response = response.slice(0, 2000);
  if (error) task.error = error;

  if (status === "completed" || status === "error") {
    const start = new Date(task.createdAt).getTime();
    task.durationMs = Date.now() - start;
  }
}

/**
 * Add progress to a task
 */
export function addTaskProgress(taskId: string, message: string): void {
  const task = tasks.get(taskId);
  if (!task) return;

  task.progress.push({
    timestamp: new Date().toISOString(),
    message,
  });
  task.updatedAt = new Date().toISOString();
  task.status = "in_progress";

  // Keep only last 50 progress entries
  if (task.progress.length > 50) {
    task.progress = task.progress.slice(-50);
  }
}

/**
 * Add a tool to the task's toolsUsed list
 */
export function addToolUsed(taskId: string, toolName: string): void {
  const task = tasks.get(taskId);
  if (!task) return;

  if (!task.toolsUsed.includes(toolName)) {
    task.toolsUsed.push(toolName);
  }
}

/**
 * Get recent tasks
 */
export function getRecentTasks(
  limit = 10,
  statusFilter?: Task["status"],
): Task[] {
  let result = Array.from(tasks.values());

  if (statusFilter) {
    result = result.filter((t) => t.status === statusFilter);
  }

  return result
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, limit);
}

/**
 * Get tasks for a specific source/chat
 */
export function getTasksForChat(
  source: string,
  chatId?: string,
  limit = 10,
): Task[] {
  return Array.from(tasks.values())
    .filter((t) => t.source === source && (!chatId || t.chatId === chatId))
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, limit);
}

/**
 * Get task summary statistics
 */
export function getTaskSummary(): {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  error: number;
  recentTasks: Array<{
    id: string;
    status: string;
    message: string;
    age: string;
  }>;
} {
  const all = Array.from(tasks.values());
  const now = Date.now();

  const formatAge = (createdAt: string) => {
    const ms = now - new Date(createdAt).getTime();
    if (ms < 60000) return `${Math.round(ms / 1000)}s ago`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m ago`;
    if (ms < 86400000) return `${Math.round(ms / 3600000)}h ago`;
    return `${Math.round(ms / 86400000)}d ago`;
  };

  return {
    total: all.length,
    pending: all.filter((t) => t.status === "pending").length,
    inProgress: all.filter((t) => t.status === "in_progress").length,
    completed: all.filter((t) => t.status === "completed").length,
    error: all.filter((t) => t.status === "error").length,
    recentTasks: all
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 5)
      .map((t) => ({
        id: t.id,
        status: t.status,
        message:
          t.userMessage.slice(0, 60) + (t.userMessage.length > 60 ? "..." : ""),
        age: formatAge(t.createdAt),
      })),
  };
}

/**
 * Cancel a task
 */
export function cancelTask(taskId: string): boolean {
  const task = tasks.get(taskId);
  if (!task) return false;

  if (task.status === "completed" || task.status === "error") {
    return false; // Can't cancel finished tasks
  }

  task.status = "cancelled";
  task.updatedAt = new Date().toISOString();
  return true;
}

/**
 * Clean up stale tasks
 */
export function cleanupStaleTasks(): {
  cleaned: number;
} {
  const now = Date.now();
  let cleaned = 0;

  for (const task of tasks.values()) {
    const age = now - new Date(task.updatedAt).getTime();

    // Mark stale in_progress tasks (older than 10 minutes)
    if (task.status === "in_progress" && age > 10 * 60 * 1000) {
      task.status = "error";
      task.error = "Task timed out (stale)";
      task.updatedAt = new Date().toISOString();
      cleaned++;
    }

    // Mark abandoned pending tasks (older than 5 minutes)
    if (task.status === "pending" && age > 5 * 60 * 1000) {
      task.status = "error";
      task.error = "Task abandoned (never started)";
      task.updatedAt = new Date().toISOString();
      cleaned++;
    }
  }

  return { cleaned };
}
