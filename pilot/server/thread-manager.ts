/**
 * Thread Manager
 *
 * File-based JSON thread management for conversation continuity.
 *
 * Threads are stored in ~/.deco/pilot/threads/ to avoid triggering HMR.
 * Each thread has a TTL (default 5 min) - messages within TTL continue the same thread.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ============================================================================
// Configuration
// ============================================================================

// Store threads in ~/.deco/pilot/threads to avoid triggering HMR during dev
const THREADS_DIR = join(homedir(), ".deco", "pilot", "threads");
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// Types
// ============================================================================

export interface ThreadMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface Thread {
  id: string;
  source: string;
  chatId: string;
  createdAt: string;
  lastActivityAt: string;
  status: "open" | "closed";
  messages: ThreadMessage[];
}

// ============================================================================
// Helpers
// ============================================================================

function ensureThreadsDir(): void {
  if (!existsSync(THREADS_DIR)) {
    mkdirSync(THREADS_DIR, { recursive: true });
  }
}

function getThreadPath(threadId: string): string {
  return join(THREADS_DIR, `${threadId}.json`);
}

function generateThreadId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = now.toISOString().slice(11, 19).replace(/:/g, "");
  const rand = Math.random().toString(36).slice(2, 6);
  return `thread-${date}-${time}-${rand}`;
}

// ============================================================================
// Thread Operations
// ============================================================================

/**
 * Find an open thread for the given source/chatId within TTL.
 */
export function findActiveThread(
  source: string,
  chatId: string,
  ttlMs: number = DEFAULT_TTL_MS,
): Thread | null {
  ensureThreadsDir();

  const now = Date.now();
  const files = readdirSync(THREADS_DIR).filter((f) => f.endsWith(".json"));

  // Sort by modification time (newest first)
  const sortedFiles = files
    .map((f) => {
      const path = join(THREADS_DIR, f);
      let mtime = 0;
      try {
        const content = readFileSync(path, "utf-8");
        const thread = JSON.parse(content) as Thread;
        mtime = new Date(thread.lastActivityAt).getTime();
      } catch {
        // Invalid JSON or read error, skip
      }
      return { name: f, path, mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);

  for (const file of sortedFiles) {
    try {
      const content = readFileSync(file.path, "utf-8");
      const thread: Thread = JSON.parse(content);

      // Check if thread matches source/chatId and is open
      if (thread.source !== source) continue;
      if (thread.chatId !== chatId) continue;
      if (thread.status !== "open") continue;

      // Check TTL
      const lastActivity = new Date(thread.lastActivityAt).getTime();
      if (now - lastActivity > ttlMs) {
        // Thread expired - mark as closed
        thread.status = "closed";
        writeFileSync(file.path, JSON.stringify(thread, null, 2));
        continue;
      }

      return thread;
    } catch {
      // Invalid JSON, skip
      continue;
    }
  }

  return null;
}

/**
 * Create a new thread.
 */
export function createThread(source: string, chatId: string): Thread {
  ensureThreadsDir();

  const now = new Date().toISOString();
  const thread: Thread = {
    id: generateThreadId(),
    source,
    chatId,
    createdAt: now,
    lastActivityAt: now,
    status: "open",
    messages: [],
  };

  writeFileSync(getThreadPath(thread.id), JSON.stringify(thread, null, 2));
  console.error(`[thread] Created new thread: ${thread.id}`);

  return thread;
}

/**
 * Add a message to a thread and update lastActivityAt.
 */
export function addMessage(
  threadId: string,
  role: "user" | "assistant",
  content: string,
): void {
  const path = getThreadPath(threadId);
  if (!existsSync(path)) {
    console.error(`[thread] Thread not found: ${threadId}`);
    return;
  }

  let thread: Thread;
  try {
    const content = readFileSync(path, "utf-8");
    thread = JSON.parse(content);
  } catch (error) {
    console.error(`[thread] Failed to parse thread ${threadId}:`, error);
    return;
  }

  thread.messages.push({
    role,
    content,
    timestamp: new Date().toISOString(),
  });
  thread.lastActivityAt = new Date().toISOString();

  writeFileSync(path, JSON.stringify(thread, null, 2));
}

/**
 * Close a thread (mark as closed).
 */
export function closeThread(threadId: string): void {
  const path = getThreadPath(threadId);
  if (!existsSync(path)) {
    console.error(`[thread] Thread not found: ${threadId}`);
    return;
  }

  const thread: Thread = JSON.parse(readFileSync(path, "utf-8"));
  thread.status = "closed";
  thread.lastActivityAt = new Date().toISOString();

  writeFileSync(path, JSON.stringify(thread, null, 2));
  console.error(`[thread] Closed thread: ${threadId}`);
}

/**
 * Get a thread by ID.
 */
export function getThread(threadId: string): Thread | null {
  const path = getThreadPath(threadId);
  if (!existsSync(path)) return null;

  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Close all open threads for a source (used when /new is called).
 */
export function closeAllThreadsForSource(source: string): number {
  ensureThreadsDir();

  let closed = 0;
  const files = readdirSync(THREADS_DIR).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    try {
      const path = join(THREADS_DIR, file);
      const thread: Thread = JSON.parse(readFileSync(path, "utf-8"));

      if (thread.source === source && thread.status === "open") {
        thread.status = "closed";
        thread.lastActivityAt = new Date().toISOString();
        writeFileSync(path, JSON.stringify(thread, null, 2));
        closed++;
      }
    } catch {
      continue;
    }
  }

  console.error(`[thread] Closed ${closed} threads for source: ${source}`);
  return closed;
}

/**
 * Get or create a thread for handling a message.
 * Returns existing active thread if within TTL, otherwise creates new one.
 */
export function getOrCreateThread(
  source: string,
  chatId: string,
  forceNew: boolean = false,
): Thread {
  if (forceNew) {
    closeAllThreadsForSource(source);
  }

  const existing = findActiveThread(source, chatId);
  if (existing) {
    console.error(
      `[thread] Continuing thread: ${existing.id} (${existing.messages.length} messages)`,
    );
    return existing;
  }

  return createThread(source, chatId);
}

/**
 * Build message history for LLM context from a thread.
 */
export function buildMessageHistory(
  thread: Thread,
): Array<{ role: string; content: string }> {
  return thread.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
}
