/**
 * Thread Manager for Slack MCP
 *
 * Manages logical conversation threads to solve the problem of
 * context mixing. Each @mention to the bot creates a new logical thread.
 *
 * Key insight: Use message.ts (timestamp) as thread identifier, not channel_id.
 * This ensures each conversation context is properly isolated.
 */

import { getKvStore } from "./kv.ts";
import type { ThreadContext, ThreadMessage } from "./types.ts";

// Key patterns for thread storage
const getThreadKey = (channelId: string, threadTs: string) =>
  `slack:thread:${channelId}:${threadTs}`;
const getChannelLatestKey = (channelId: string) =>
  `slack:channel-latest:${channelId}`;

/**
 * Configuration for thread management
 */
export interface ThreadManagerConfig {
  timeoutMinutes?: number;
}

let threadConfig: ThreadManagerConfig = {};

export function configureThreadManager(config: ThreadManagerConfig): void {
  threadConfig = config;
}

function getTimeoutMs(): number {
  return (threadConfig.timeoutMinutes ?? 10) * 60 * 1000;
}

/**
 * Get or create a thread context.
 *
 * The key insight for solving the Slack thread problem:
 * - If the message is in a Slack thread (has thread_ts), use that as the logical thread ID
 * - If it's a new @mention (no thread_ts), create a new logical thread using the message ts
 * - This ensures each @mention starts fresh, but replies in the same Slack thread share context
 */
export async function getOrCreateThread(
  channelId: string,
  messageTs: string,
  slackThreadTs?: string,
): Promise<ThreadContext> {
  const kv = getKvStore();
  const now = Date.now();
  const timeoutMs = getTimeoutMs();

  // Determine the thread key:
  // - If in a Slack thread, use the thread_ts (parent message timestamp)
  // - If a new message (potential new conversation), use the message's own ts
  const threadIdentifier = slackThreadTs ?? messageTs;
  const key = getThreadKey(channelId, threadIdentifier);

  // Try to get existing thread
  const existing = await kv.get<ThreadContext>(key);

  if (existing && now - existing.lastActivity < timeoutMs) {
    // Thread is still active, return it
    return existing;
  }

  // Create new thread context
  const newThread: ThreadContext = {
    threadId: `${channelId}:${threadIdentifier}`,
    slackThreadTs: slackThreadTs,
    channelId,
    messages: [],
    lastActivity: now,
  };

  await kv.set(key, newThread, timeoutMs * 2); // TTL = 2x timeout for cleanup
  return newThread;
}

/**
 * Append a user message to the thread
 */
export async function appendUserMessage(
  channelId: string,
  messageTs: string,
  text: string,
  options: {
    slackThreadTs?: string;
    userId?: string;
    userName?: string;
  } = {},
): Promise<ThreadContext> {
  const thread = await getOrCreateThread(
    channelId,
    messageTs,
    options.slackThreadTs,
  );
  const kv = getKvStore();
  const now = Date.now();

  const userMessage: ThreadMessage = {
    role: "user",
    content: text,
    timestamp: now,
    slackTs: messageTs,
    userId: options.userId,
    userName: options.userName,
  };

  thread.messages.push(userMessage);
  thread.lastActivity = now;

  const threadIdentifier = options.slackThreadTs ?? messageTs;
  const key = getThreadKey(channelId, threadIdentifier);
  await kv.set(key, thread, getTimeoutMs() * 2);

  // Update channel's latest thread reference
  await kv.set(
    getChannelLatestKey(channelId),
    threadIdentifier,
    getTimeoutMs(),
  );

  return thread;
}

/**
 * Append an assistant message to the thread
 */
export async function appendAssistantMessage(
  channelId: string,
  threadIdentifier: string,
  text: string,
  slackTs?: string,
): Promise<ThreadContext> {
  const thread = await getOrCreateThread(channelId, threadIdentifier);
  const kv = getKvStore();
  const now = Date.now();

  const assistantMessage: ThreadMessage = {
    role: "assistant",
    content: text,
    timestamp: now,
    slackTs,
  };

  thread.messages.push(assistantMessage);
  thread.lastActivity = now;

  const key = getThreadKey(channelId, threadIdentifier);
  await kv.set(key, thread, getTimeoutMs() * 2);

  return thread;
}

/**
 * Get messages formatted for the LLM
 */
export async function getThreadMessagesForLLM(
  channelId: string,
  threadIdentifier: string,
): Promise<{ role: "user" | "assistant" | "system"; content: string }[]> {
  const thread = await getOrCreateThread(channelId, threadIdentifier);

  return thread.messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}

/**
 * Get the latest N messages from a thread
 */
export async function getRecentMessages(
  channelId: string,
  threadIdentifier: string,
  count: number = 10,
): Promise<ThreadMessage[]> {
  const thread = await getOrCreateThread(channelId, threadIdentifier);
  return thread.messages.slice(-count);
}

/**
 * Check if a thread is still active (within timeout)
 */
export async function isThreadActive(
  channelId: string,
  threadIdentifier: string,
): Promise<boolean> {
  const kv = getKvStore();
  const key = getThreadKey(channelId, threadIdentifier);
  const thread = await kv.get<ThreadContext>(key);

  if (!thread) return false;

  const now = Date.now();
  return now - thread.lastActivity < getTimeoutMs();
}

/**
 * Force reset a thread (clear all messages)
 */
export async function resetThread(
  channelId: string,
  threadIdentifier: string,
): Promise<void> {
  const kv = getKvStore();
  const key = getThreadKey(channelId, threadIdentifier);
  await kv.delete(key);
}

/**
 * Get thread metadata
 */
export async function getThreadMetadata(
  channelId: string,
  threadIdentifier: string,
): Promise<{
  threadId: string;
  messageCount: number;
  lastActivity: number;
  isActive: boolean;
} | null> {
  const kv = getKvStore();
  const key = getThreadKey(channelId, threadIdentifier);
  const thread = await kv.get<ThreadContext>(key);

  if (!thread) return null;

  const now = Date.now();
  return {
    threadId: thread.threadId,
    messageCount: thread.messages.length,
    lastActivity: thread.lastActivity,
    isActive: now - thread.lastActivity < getTimeoutMs(),
  };
}

/**
 * Get the channel's latest active thread identifier
 */
export async function getChannelLatestThread(
  channelId: string,
): Promise<string | null> {
  const kv = getKvStore();
  return kv.get<string>(getChannelLatestKey(channelId));
}

/**
 * Set metadata on a thread
 */
export async function setThreadMetadata(
  channelId: string,
  threadIdentifier: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const thread = await getOrCreateThread(channelId, threadIdentifier);
  const kv = getKvStore();

  thread.metadata = { ...thread.metadata, ...metadata };

  const key = getThreadKey(channelId, threadIdentifier);
  await kv.set(key, thread, getTimeoutMs() * 2);
}
