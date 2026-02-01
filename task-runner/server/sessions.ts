/**
 * Session Persistence for Task Runner
 *
 * Persists agent sessions to .beads/sessions.json for durability across
 * server restarts. Large outputs are stored in .beads/logs/ as separate files.
 */

import { mkdir } from "node:fs/promises";

// ============================================================================
// Types
// ============================================================================

export interface ToolCall {
  name: string;
  input?: Record<string, unknown>;
  timestamp: string;
}

export interface AgentMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: string;
  toolCall?: ToolCall;
}

export interface AgentSession {
  id: string;
  taskId: string;
  taskTitle?: string;
  pid: number;
  status: "running" | "completed" | "failed" | "stopped";
  startedAt: string;
  completedAt?: string;
  output: string; // Captured stdout/stderr (truncated if too large)
  exitCode?: number;
  error?: string;
  // Structured logs
  toolCalls?: ToolCall[];
  messages?: AgentMessage[];
}

export interface SessionStore {
  sessions: AgentSession[];
  lastUpdated: string;
}

// ============================================================================
// Constants
// ============================================================================

const SESSIONS_FILE = ".beads/sessions.json";
const LOG_DIR = ".beads/logs";
const MAX_INLINE_OUTPUT = 10000; // 10KB inline, rest in log file

// ============================================================================
// Session Storage Functions
// ============================================================================

/**
 * Load sessions from .beads/sessions.json
 */
export async function loadSessions(workspace: string): Promise<SessionStore> {
  const path = `${workspace}/${SESSIONS_FILE}`;
  try {
    const content = await Bun.file(path).text();
    return JSON.parse(content);
  } catch {
    return { sessions: [], lastUpdated: new Date().toISOString() };
  }
}

/**
 * Save sessions to .beads/sessions.json
 */
export async function saveSessions(
  workspace: string,
  store: SessionStore,
): Promise<void> {
  const path = `${workspace}/${SESSIONS_FILE}`;
  store.lastUpdated = new Date().toISOString();
  await Bun.write(path, JSON.stringify(store, null, 2));
}

/**
 * Add a new session to the store
 */
export async function addSession(
  workspace: string,
  session: AgentSession,
): Promise<void> {
  const store = await loadSessions(workspace);
  store.sessions.push(session);
  await saveSessions(workspace, store);
}

/**
 * Update an existing session
 */
export async function updateSession(
  workspace: string,
  sessionId: string,
  updates: Partial<AgentSession>,
): Promise<void> {
  const store = await loadSessions(workspace);
  const idx = store.sessions.findIndex((s) => s.id === sessionId);
  if (idx >= 0) {
    store.sessions[idx] = { ...store.sessions[idx], ...updates };
    await saveSessions(workspace, store);
  }
}

/**
 * Get a session by ID
 */
export async function getSession(
  workspace: string,
  sessionId: string,
): Promise<AgentSession | undefined> {
  const store = await loadSessions(workspace);
  return store.sessions.find((s) => s.id === sessionId);
}

/**
 * Get all sessions, optionally filtered by status
 */
export async function getSessions(
  workspace: string,
  status?: AgentSession["status"],
): Promise<AgentSession[]> {
  const store = await loadSessions(workspace);
  if (status) {
    return store.sessions.filter((s) => s.status === status);
  }
  return store.sessions;
}

/**
 * Clean up stale sessions where the process is no longer alive.
 * This handles cases where the MCP server restarted and lost track of processes.
 */
export async function cleanupStaleSessions(workspace: string): Promise<number> {
  const store = await loadSessions(workspace);
  let cleaned = 0;

  for (const session of store.sessions) {
    if (session.status === "running") {
      // Check if the process is still alive
      const alive = await isProcessAlive(session.pid);
      if (!alive) {
        session.status = "failed";
        session.completedAt = new Date().toISOString();
        session.error = "Process died or server restarted";
        session.exitCode = -1;
        cleaned++;
        console.log(
          `[sessions] Cleaned up stale session ${session.id} (pid ${session.pid})`,
        );
      }
    }
  }

  if (cleaned > 0) {
    await saveSessions(workspace, store);
  }

  return cleaned;
}

// ============================================================================
// Log File Functions
// ============================================================================

/**
 * Ensure the logs directory exists
 */
export async function ensureLogDir(workspace: string): Promise<void> {
  const logPath = `${workspace}/${LOG_DIR}`;
  await mkdir(logPath, { recursive: true });
}

/**
 * Get the log file path for a session
 */
export function getLogPath(workspace: string, sessionId: string): string {
  return `${workspace}/${LOG_DIR}/session-${sessionId}.log`;
}

/**
 * Append output to a session's log file
 */
export async function appendOutput(
  workspace: string,
  sessionId: string,
  chunk: string,
): Promise<void> {
  await ensureLogDir(workspace);
  const logPath = getLogPath(workspace, sessionId);

  // Read existing content and append
  let existing = "";
  try {
    existing = await Bun.file(logPath).text();
  } catch {
    // File doesn't exist yet
  }
  await Bun.write(logPath, existing + chunk);
}

/**
 * Read the full log for a session
 */
export async function readLog(
  workspace: string,
  sessionId: string,
): Promise<string> {
  const logPath = getLogPath(workspace, sessionId);
  try {
    return await Bun.file(logPath).text();
  } catch {
    return "";
  }
}

/**
 * Truncate output for inline storage in sessions.json
 */
export function truncateOutput(output: string): string {
  if (output.length <= MAX_INLINE_OUTPUT) {
    return output;
  }
  const truncated = output.slice(0, MAX_INLINE_OUTPUT);
  return `${truncated}\n\n... [truncated, see log file for full output]`;
}

// ============================================================================
// Process Utilities
// ============================================================================

/**
 * Check if a process is still running by PID
 */
export async function isProcessAlive(pid: number): Promise<boolean> {
  try {
    // Send signal 0 to check if process exists
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Recover orphaned sessions on server restart
 * Marks sessions that were "running" but whose processes are dead as "failed"
 */
export async function recoverSessions(workspace: string): Promise<void> {
  const store = await loadSessions(workspace);
  let updated = false;

  for (const session of store.sessions) {
    if (session.status === "running") {
      const alive = await isProcessAlive(session.pid);
      if (!alive) {
        session.status = "failed";
        session.error = "Process died unexpectedly (server restart)";
        session.completedAt = new Date().toISOString();
        updated = true;
      }
    }
  }

  if (updated) {
    await saveSessions(workspace, store);
  }
}

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `session-${timestamp}-${random}`;
}

// ============================================================================
// Claude Output Parsing
// ============================================================================

/**
 * Parse a line of Claude's stream-json output
 * Returns parsed event or null if not valid JSON
 */
export function parseClaudeEvent(
  line: string,
): { type: string; [key: string]: unknown } | null {
  try {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("{")) {
      return null;
    }
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/**
 * Extract tool call from Claude event
 */
export function extractToolCall(
  event: { type: string; [key: string]: unknown },
): ToolCall | null {
  const timestamp = new Date().toISOString();

  // Claude stream-json format has tool_use nested inside:
  // {"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{...}}]}}
  if (event.type === "assistant" && event.message) {
    const message = event.message as {
      content?: Array<{ type: string; name?: string; input?: Record<string, unknown> }>;
    };
    const toolUse = message.content?.find((c) => c.type === "tool_use");
    if (toolUse && toolUse.name) {
      return {
        name: toolUse.name,
        input: toolUse.input,
        timestamp,
      };
    }
  }

  // Also handle direct tool_use events (fallback)
  if (event.type === "tool_use" && typeof event.name === "string") {
    return {
      name: event.name,
      input: event.input as Record<string, unknown> | undefined,
      timestamp,
    };
  }

  return null;
}

/**
 * Extract message from Claude event
 */
export function extractMessage(
  event: { type: string; [key: string]: unknown },
): AgentMessage | null {
  const timestamp = new Date().toISOString();

  // Assistant text - direct format
  if (event.type === "text" && typeof event.text === "string") {
    return {
      role: "assistant",
      content: event.text,
      timestamp,
    };
  }

  // Assistant message - nested format
  // {"type":"assistant","message":{"content":[{"type":"text","text":"..."}]}}
  if (event.type === "assistant" && event.message) {
    const message = event.message as {
      content?: Array<{ type: string; text?: string }>;
    };
    const textContent = message.content?.find((c) => c.type === "text");
    if (textContent?.text) {
      return {
        role: "assistant",
        content: textContent.text,
        timestamp,
      };
    }
  }

  // Assistant message completion (legacy format)
  if (event.type === "assistant" && typeof event.message === "string") {
    return {
      role: "assistant",
      content: event.message,
      timestamp,
    };
  }

  // Tool result
  if (event.type === "tool_result") {
    return {
      role: "tool",
      content:
        typeof event.output === "string"
          ? event.output
          : JSON.stringify(event.output),
      timestamp,
    };
  }

  return null;
}

/**
 * Add a tool call to a session
 */
export async function addToolCall(
  workspace: string,
  sessionId: string,
  toolCall: ToolCall,
): Promise<void> {
  const store = await loadSessions(workspace);
  const idx = store.sessions.findIndex((s) => s.id === sessionId);
  if (idx >= 0) {
    const session = store.sessions[idx];
    session.toolCalls = session.toolCalls || [];
    session.toolCalls.push(toolCall);
    await saveSessions(workspace, store);
  }
}

/**
 * Add a message to a session
 */
export async function addMessage(
  workspace: string,
  sessionId: string,
  message: AgentMessage,
): Promise<void> {
  const store = await loadSessions(workspace);
  const idx = store.sessions.findIndex((s) => s.id === sessionId);
  if (idx >= 0) {
    const session = store.sessions[idx];
    session.messages = session.messages || [];
    session.messages.push(message);
    await saveSessions(workspace, store);
  }
}
