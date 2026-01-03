/**
 * Conversation Manager
 *
 * Manages long-running conversation threads.
 * A conversation is a special type of task that:
 * - Stays "working" until timeout or explicit end
 * - Routes new messages to the existing thread
 * - Has its own timeout (default 5 minutes)
 */

import type { Task } from "../types/task.ts";
import { loadTask, saveTask, listTasks } from "./task-storage.ts";

// Active conversations keyed by source:chatId
const activeConversations = new Map<string, string>();

/**
 * Get conversation timeout from env (default 5 minutes)
 */
function getConversationTimeout(): number {
  return parseInt(process.env.CONVERSATION_TIMEOUT_MS || "300000", 10);
}

/**
 * Generate a conversation key from source and chatId
 */
function getConversationKey(source: string, chatId?: string): string {
  return `${source}:${chatId || "default"}`;
}

/**
 * Check if a task is an active conversation
 */
function isActiveConversation(task: Task): boolean {
  if (task.status !== "working") return false;
  if (task.workflowId !== (process.env.CONVERSATION_WORKFLOW || "conversation"))
    return false;

  // Check timeout
  const timeout = getConversationTimeout();
  const lastUpdate = new Date(task.lastUpdatedAt).getTime();
  const now = Date.now();

  return now - lastUpdate < timeout;
}

/**
 * Get active conversation for a source/chat
 */
export function getActiveConversation(
  source: string,
  chatId?: string,
): Task | null {
  const key = getConversationKey(source, chatId);

  // Check cache first
  const cachedTaskId = activeConversations.get(key);
  if (cachedTaskId) {
    const task = loadTask(cachedTaskId);
    if (task && isActiveConversation(task)) {
      return task;
    }
    // Remove stale cache entry
    activeConversations.delete(key);
  }

  // Search for active conversation in storage
  const { tasks } = listTasks({ status: "working", source, limit: 10 });
  for (const task of tasks) {
    if (task.chatId === chatId && isActiveConversation(task)) {
      activeConversations.set(key, task.taskId);
      return task;
    }
  }

  return null;
}

/**
 * Register a task as an active conversation
 */
export function registerConversation(task: Task): void {
  const key = getConversationKey(task.source, task.chatId);
  activeConversations.set(key, task.taskId);
}

/**
 * End a conversation
 */
export function endConversation(source: string, chatId?: string): Task | null {
  const key = getConversationKey(source, chatId);
  const taskId = activeConversations.get(key);

  if (taskId) {
    activeConversations.delete(key);
    const task = loadTask(taskId);
    if (task) {
      task.status = "completed";
      task.lastUpdatedAt = new Date().toISOString();
      task.statusMessage = "Conversation ended";
      saveTask(task);
      return task;
    }
  }

  return null;
}

/**
 * Add a message to a conversation's history
 */
export function addMessageToConversation(
  taskId: string,
  role: "user" | "assistant",
  content: string,
): Task | null {
  const task = loadTask(taskId);
  if (!task) return null;

  // Update the input to include the new message in history
  const history =
    (task.workflowInput.history as Array<{
      role: string;
      content: string;
    }>) || [];

  history.push({ role, content });

  // Keep last 20 messages to avoid context overflow
  if (history.length > 20) {
    task.workflowInput.history = history.slice(-20);
  } else {
    task.workflowInput.history = history;
  }

  task.lastUpdatedAt = new Date().toISOString();
  saveTask(task);

  return task;
}

/**
 * Get conversation history
 */
export function getConversationHistory(
  taskId: string,
): Array<{ role: string; content: string }> {
  const task = loadTask(taskId);
  if (!task) return [];

  return (
    (task.workflowInput.history as Array<{
      role: string;
      content: string;
    }>) || []
  );
}

/**
 * Check if response indicates end of conversation
 */
export function isEndOfConversation(response: string): boolean {
  return response.includes("[END_CONVERSATION]");
}

/**
 * Clean response of end markers
 */
export function cleanConversationResponse(response: string): string {
  return response.replace(/\[END_CONVERSATION\]/g, "").trim();
}

/**
 * Cleanup expired conversations
 */
export function cleanupExpiredConversations(): number {
  let cleaned = 0;
  const timeout = getConversationTimeout();
  const now = Date.now();

  for (const [key, taskId] of activeConversations.entries()) {
    const task = loadTask(taskId);
    if (!task) {
      activeConversations.delete(key);
      cleaned++;
      continue;
    }

    const lastUpdate = new Date(task.lastUpdatedAt).getTime();
    if (now - lastUpdate >= timeout) {
      // Mark as completed due to timeout
      task.status = "completed";
      task.lastUpdatedAt = new Date().toISOString();
      task.statusMessage = "Conversation timed out";
      saveTask(task);
      activeConversations.delete(key);
      cleaned++;
    }
  }

  return cleaned;
}

/**
 * Get default model for conversations
 */
export function getConversationModel(): "fast" | "smart" {
  const model = process.env.CONVERSATION_DEFAULT_MODEL;
  return model === "smart" ? "smart" : "fast";
}
