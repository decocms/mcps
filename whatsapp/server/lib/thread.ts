import { getKvStore } from "./kv";

// Thread inactivity timeout: 10 minutes in milliseconds
const THREAD_TIMEOUT_MS = 10 * 60 * 1000;

// Message part types following the mesh API format
export interface TextPart {
  type: "text";
  text: string;
}

export interface ToolCallPart {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  input: string; // JSON string
}

export interface ToolResultPart {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  output: unknown;
  result: unknown;
}

export type MessagePart = TextPart | ToolCallPart | ToolResultPart;

export interface ThreadMessage {
  role: "user" | "assistant";
  parts: MessagePart[];
  timestamp: number;
}

export interface Thread {
  threadId: string;
  messages: ThreadMessage[];
  lastActivity: number;
}

// Key pattern for thread storage
const getThreadKey = (phoneNumber: string) => `whatsapp:thread:${phoneNumber}`;

/**
 * Gets an existing thread if active (last activity < 10 min), otherwise creates a new one.
 */
export async function getOrCreateThread(phoneNumber: string): Promise<Thread> {
  const kv = getKvStore();
  const key = getThreadKey(phoneNumber);
  const existing = await kv.get<Thread>(key);
  const now = Date.now();

  if (existing && now - existing.lastActivity < THREAD_TIMEOUT_MS) {
    // Thread is still active, return it
    return existing;
  }

  // Create new thread
  const newThread: Thread = {
    threadId: crypto.randomUUID(),
    messages: [],
    lastActivity: now,
  };

  await kv.set(key, newThread);
  return newThread;
}

/**
 * Appends a user message to the thread and refreshes lastActivity.
 */
export async function appendUserMessage(
  phoneNumber: string,
  text: string,
): Promise<Thread> {
  const kv = getKvStore();
  const key = getThreadKey(phoneNumber);
  const thread = await getOrCreateThread(phoneNumber);
  const now = Date.now();

  const userMessage: ThreadMessage = {
    role: "user",
    parts: [{ type: "text", text }],
    timestamp: now,
  };

  thread.messages.push(userMessage);
  thread.lastActivity = now;

  await kv.set(key, thread);
  return thread;
}

/**
 * Appends an assistant message with all collected parts to the thread.
 */
export async function appendAssistantMessage(
  phoneNumber: string,
  parts: MessagePart[],
): Promise<Thread> {
  const kv = getKvStore();
  const key = getThreadKey(phoneNumber);
  const thread = await getOrCreateThread(phoneNumber);
  const now = Date.now();

  const assistantMessage: ThreadMessage = {
    role: "assistant",
    parts,
    timestamp: now,
  };

  thread.messages.push(assistantMessage);
  thread.lastActivity = now;

  await kv.set(key, thread);
  return thread;
}

/**
 * Returns messages formatted for the mesh API.
 */
export async function getThreadMessages(
  phoneNumber: string,
): Promise<{ role: "user" | "assistant"; parts: MessagePart[] }[]> {
  const thread = await getOrCreateThread(phoneNumber);

  return thread.messages.map((msg) => ({
    role: msg.role,
    parts: msg.parts,
  }));
}
