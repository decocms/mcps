/**
 * Slack Web API Client Wrapper
 *
 * Provides a typed interface to the Slack Web API.
 */

import { WebClient, type ChatPostMessageResponse } from "@slack/web-api";
import type {
  SlackChannel,
  SlackMessage,
  SlackUser,
  SlackBlock,
} from "./types.ts";

let webClient: WebClient | null = null;
let currentBotToken: string | null = null;

export interface SlackClientConfig {
  botToken: string;
}

/**
 * Initialize the Slack Web Client
 */
export function initializeSlackClient(config: SlackClientConfig): WebClient {
  webClient = new WebClient(config.botToken);
  currentBotToken = config.botToken;
  console.log("[Slack] Web client initialized");
  return webClient;
}

/**
 * Get the current Slack client instance
 */
export function getSlackClient(): WebClient | null {
  return webClient;
}

/**
 * Ensure the Slack client is initialized, initializing if needed
 */
export function ensureSlackClient(botToken?: string): WebClient | null {
  // If client exists, return it
  if (webClient) {
    return webClient;
  }

  // If we have a token, initialize
  if (botToken) {
    return initializeSlackClient({ botToken });
  }

  // If we had a previous token, reinitialize
  if (currentBotToken) {
    return initializeSlackClient({ botToken: currentBotToken });
  }

  return null;
}

/**
 * Get bot info
 */
export async function getBotInfo(): Promise<{
  userId: string;
  botId: string;
  teamId: string;
} | null> {
  if (!webClient) return null;

  try {
    const result = await webClient.auth.test();
    return {
      userId: result.user_id as string,
      botId: result.bot_id as string,
      teamId: result.team_id as string,
    };
  } catch (error) {
    console.error("[Slack] Failed to get bot info:", error);
    return null;
  }
}

// ============================================================================
// MESSAGE METHODS
// ============================================================================

export interface SendMessageOptions {
  channel: string;
  text: string;
  threadTs?: string;
  blocks?: SlackBlock[];
  unfurlLinks?: boolean;
  unfurlMedia?: boolean;
  mrkdwn?: boolean;
}

/**
 * Send a message to a channel or thread
 */
export async function sendMessage(
  options: SendMessageOptions,
): Promise<ChatPostMessageResponse | null> {
  if (!webClient) {
    console.error("[Slack] Client not initialized");
    return null;
  }

  try {
    const result = await webClient.chat.postMessage({
      channel: options.channel,
      text: options.text,
      thread_ts: options.threadTs,
      blocks: options.blocks,
      unfurl_links: options.unfurlLinks ?? false,
      unfurl_media: options.unfurlMedia ?? true,
      mrkdwn: options.mrkdwn ?? true,
    });

    return result;
  } catch (error) {
    console.error("[Slack] Failed to send message:", error);
    throw error;
  }
}

/**
 * Reply in a thread
 */
export async function replyInThread(
  channel: string,
  threadTs: string,
  text: string,
  blocks?: SlackBlock[],
): Promise<ChatPostMessageResponse | null> {
  return sendMessage({
    channel,
    text,
    threadTs,
    blocks,
  });
}

/**
 * Update an existing message
 */
export async function updateMessage(
  channel: string,
  ts: string,
  text: string,
  blocks?: SlackBlock[],
): Promise<boolean> {
  if (!webClient) return false;

  try {
    await webClient.chat.update({
      channel,
      ts,
      text,
      blocks,
    });
    return true;
  } catch (error) {
    console.error("[Slack] Failed to update message:", error);
    return false;
  }
}

/**
 * Delete a message
 */
export async function deleteMessage(
  channel: string,
  ts: string,
): Promise<boolean> {
  if (!webClient) return false;

  try {
    await webClient.chat.delete({
      channel,
      ts,
    });
    return true;
  } catch (error) {
    console.error("[Slack] Failed to delete message:", error);
    return false;
  }
}

/**
 * Get message history from a channel
 */
export async function getChannelHistory(
  channel: string,
  options: {
    limit?: number;
    oldest?: string;
    latest?: string;
    inclusive?: boolean;
  } = {},
): Promise<SlackMessage[]> {
  if (!webClient) return [];

  try {
    const result = await webClient.conversations.history({
      channel,
      limit: options.limit ?? 100,
      oldest: options.oldest,
      latest: options.latest,
      inclusive: options.inclusive,
    });

    return (result.messages as SlackMessage[]) ?? [];
  } catch (error) {
    console.error("[Slack] Failed to get channel history:", error);
    return [];
  }
}

/**
 * Get replies in a thread
 */
export async function getThreadReplies(
  channel: string,
  threadTs: string,
  limit: number = 100,
): Promise<SlackMessage[]> {
  if (!webClient) return [];

  try {
    const result = await webClient.conversations.replies({
      channel,
      ts: threadTs,
      limit,
    });

    return (result.messages as SlackMessage[]) ?? [];
  } catch (error) {
    console.error("[Slack] Failed to get thread replies:", error);
    return [];
  }
}

// ============================================================================
// CHANNEL METHODS
// ============================================================================

/**
 * List all channels the bot has access to
 */
export async function listChannels(
  options: {
    excludeArchived?: boolean;
    types?: string;
    limit?: number;
  } = {},
): Promise<SlackChannel[]> {
  if (!webClient) return [];

  try {
    const result = await webClient.conversations.list({
      exclude_archived: options.excludeArchived ?? true,
      types: options.types ?? "public_channel,private_channel",
      limit: options.limit ?? 200,
    });

    return (result.channels as SlackChannel[]) ?? [];
  } catch (error) {
    console.error("[Slack] Failed to list channels:", error);
    return [];
  }
}

/**
 * Get channel info
 */
export async function getChannelInfo(
  channel: string,
): Promise<SlackChannel | null> {
  if (!webClient) return null;

  try {
    const result = await webClient.conversations.info({
      channel,
    });

    return result.channel as SlackChannel;
  } catch (error) {
    console.error("[Slack] Failed to get channel info:", error);
    return null;
  }
}

/**
 * Join a channel
 */
export async function joinChannel(channel: string): Promise<boolean> {
  if (!webClient) return false;

  try {
    await webClient.conversations.join({
      channel,
    });
    return true;
  } catch (error) {
    console.error("[Slack] Failed to join channel:", error);
    return false;
  }
}

/**
 * Get channel members
 */
export async function getChannelMembers(
  channel: string,
  limit: number = 200,
): Promise<string[]> {
  if (!webClient) return [];

  try {
    const result = await webClient.conversations.members({
      channel,
      limit,
    });

    return (result.members as string[]) ?? [];
  } catch (error) {
    console.error("[Slack] Failed to get channel members:", error);
    return [];
  }
}

// ============================================================================
// USER METHODS
// ============================================================================

/**
 * Get user info
 */
export async function getUserInfo(userId: string): Promise<SlackUser | null> {
  if (!webClient) return null;

  try {
    const result = await webClient.users.info({
      user: userId,
    });

    return result.user as SlackUser;
  } catch (error) {
    console.error("[Slack] Failed to get user info:", error);
    return null;
  }
}

/**
 * List all users in the workspace
 */
export async function listUsers(limit: number = 200): Promise<SlackUser[]> {
  if (!webClient) return [];

  try {
    const result = await webClient.users.list({
      limit,
    });

    return (result.members as SlackUser[]) ?? [];
  } catch (error) {
    console.error("[Slack] Failed to list users:", error);
    return [];
  }
}

// ============================================================================
// REACTION METHODS
// ============================================================================

/**
 * Add a reaction to a message
 */
export async function addReaction(
  channel: string,
  ts: string,
  emoji: string,
): Promise<boolean> {
  if (!webClient) return false;

  try {
    await webClient.reactions.add({
      channel,
      timestamp: ts,
      name: emoji.replace(/:/g, ""), // Remove colons if present
    });
    return true;
  } catch (error) {
    console.error("[Slack] Failed to add reaction:", error);
    return false;
  }
}

/**
 * Remove a reaction from a message
 */
export async function removeReaction(
  channel: string,
  ts: string,
  emoji: string,
): Promise<boolean> {
  if (!webClient) return false;

  try {
    await webClient.reactions.remove({
      channel,
      timestamp: ts,
      name: emoji.replace(/:/g, ""),
    });
    return true;
  } catch (error) {
    console.error("[Slack] Failed to remove reaction:", error);
    return false;
  }
}

// ============================================================================
// SEARCH METHODS
// ============================================================================

/**
 * Search messages
 * Note: Requires search:read scope
 */
export async function searchMessages(
  query: string,
  options: {
    count?: number;
    sort?: "score" | "timestamp";
    sortDir?: "asc" | "desc";
  } = {},
): Promise<SlackMessage[]> {
  if (!webClient) return [];

  try {
    const result = await webClient.search.messages({
      query,
      count: options.count ?? 20,
      sort: options.sort ?? "score",
      sort_dir: options.sortDir ?? "desc",
    });

    // Extract messages from search results
    const matches = result.messages?.matches ?? [];
    return matches as unknown as SlackMessage[];
  } catch (error) {
    console.error("[Slack] Failed to search messages:", error);
    return [];
  }
}

// ============================================================================
// UTILITY METHODS
// ============================================================================

/**
 * Mark a channel as read (set cursor to latest message)
 */
export async function markChannelRead(
  channel: string,
  ts: string,
): Promise<boolean> {
  if (!webClient) return false;

  try {
    await webClient.conversations.mark({
      channel,
      ts,
    });
    return true;
  } catch (error) {
    console.error("[Slack] Failed to mark channel as read:", error);
    return false;
  }
}

/**
 * Set typing indicator
 * Note: This is ephemeral and needs to be called repeatedly
 */
export async function setTyping(channel: string): Promise<boolean> {
  // Slack doesn't have a direct typing indicator API for bots
  // This is a placeholder for future implementation
  console.log(`[Slack] Typing indicator for ${channel} (not implemented)`);
  return true;
}
