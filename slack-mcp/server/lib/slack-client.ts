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
import { RATE_LIMIT, CACHE_TTL } from "./constants.ts";
import {
  getOrFetch,
  CacheKeys,
  deleteCache,
  deleteCacheByPrefix,
} from "./cache.ts";

let webClient: WebClient | null = null;
let currentBotToken: string | null = null;

// ============================================================================
// RATE LIMITING
// ============================================================================

interface RateLimitError extends Error {
  code?: string;
  data?: { error?: string; retry_after?: number };
}

/**
 * Check if an error is a rate limit error
 */
function isRateLimitError(error: unknown): error is RateLimitError {
  if (error && typeof error === "object") {
    const err = error as RateLimitError;
    return (
      err.code === "slack_webapi_rate_limited_error" ||
      err.data?.error === "ratelimited"
    );
  }
  return false;
}

/**
 * Get retry delay from rate limit error
 */
function getRetryDelay(error: RateLimitError, attempt: number): number {
  // Use Retry-After header if available
  if (error.data?.retry_after) {
    return error.data.retry_after * 1000;
  }

  // Exponential backoff
  const delay = Math.min(
    RATE_LIMIT.INITIAL_DELAY_MS *
      Math.pow(RATE_LIMIT.BACKOFF_MULTIPLIER, attempt),
    RATE_LIMIT.MAX_DELAY_MS,
  );

  return delay;
}

/**
 * Execute a function with rate limit retry
 */
export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  context = "API call",
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < RATE_LIMIT.MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (isRateLimitError(error) && attempt < RATE_LIMIT.MAX_RETRIES - 1) {
        const delay = getRetryDelay(error, attempt);
        console.warn(
          `[Slack] Rate limited on ${context}, retrying in ${delay}ms (attempt ${attempt + 1}/${RATE_LIMIT.MAX_RETRIES})`,
        );
        await sleep(delay);
        lastError = error;
      } else {
        throw error;
      }
    }
  }

  throw lastError ?? new Error("Max retries exceeded");
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
 * List all channels the bot has access to (cached)
 */
export async function listChannels(
  options: {
    excludeArchived?: boolean;
    types?: string;
    limit?: number;
    skipCache?: boolean;
  } = {},
): Promise<SlackChannel[]> {
  if (!webClient) return [];

  const fetcher = async () => {
    try {
      const result = await withRateLimitRetry(
        () =>
          webClient!.conversations.list({
            exclude_archived: options.excludeArchived ?? true,
            types: options.types ?? "public_channel,private_channel",
            limit: options.limit ?? 200,
          }),
        "listChannels",
      );
      return (result.channels as SlackChannel[]) ?? [];
    } catch (error) {
      console.error("[Slack] Failed to list channels:", error);
      return [];
    }
  };

  // Skip cache if requested
  if (options.skipCache) {
    return fetcher();
  }

  return getOrFetch(CacheKeys.channels(), fetcher, CACHE_TTL.CHANNELS);
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
 * Get user info (cached)
 */
export async function getUserInfo(
  userId: string,
  skipCache = false,
): Promise<SlackUser | null> {
  if (!webClient) return null;

  const fetcher = async () => {
    try {
      const result = await withRateLimitRetry(
        () =>
          webClient!.users.info({
            user: userId,
          }),
        "getUserInfo",
      );
      return result.user as SlackUser;
    } catch (error) {
      console.error("[Slack] Failed to get user info:", error);
      return null;
    }
  };

  if (skipCache) {
    return fetcher();
  }

  return getOrFetch(CacheKeys.user(userId), fetcher, CACHE_TTL.USER_INFO);
}

/**
 * List all users in the workspace (cached)
 */
export async function listUsers(
  limit: number = 200,
  skipCache = false,
): Promise<SlackUser[]> {
  if (!webClient) return [];

  const fetcher = async () => {
    try {
      const result = await withRateLimitRetry(
        () =>
          webClient!.users.list({
            limit,
          }),
        "listUsers",
      );
      return (result.members as SlackUser[]) ?? [];
    } catch (error) {
      console.error("[Slack] Failed to list users:", error);
      return [];
    }
  };

  if (skipCache) {
    return fetcher();
  }

  return getOrFetch(CacheKeys.users(), fetcher, CACHE_TTL.USERS);
}

/**
 * Invalidate user caches (useful after user changes)
 */
export function invalidateUserCache(userId?: string): void {
  if (userId) {
    deleteCache(CacheKeys.user(userId));
  } else {
    deleteCacheByPrefix("slack:user");
  }
}

/**
 * Invalidate channel cache
 */
export function invalidateChannelCache(): void {
  deleteCache(CacheKeys.channels());
  deleteCacheByPrefix("slack:channel");
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
 * Send a "thinking" message that will be updated with the actual response
 * Returns the message timestamp for later updating
 */
export async function sendThinkingMessage(
  channel: string,
  threadTs?: string,
): Promise<{ ts: string; channel: string } | null> {
  const thinkingText = "🤔 Pensando...";

  try {
    const result = await sendMessage({
      channel,
      text: thinkingText,
      threadTs,
    });

    if (result?.ts) {
      return { ts: result.ts, channel };
    }
    return null;
  } catch (error) {
    console.error("[Slack] Failed to send thinking message:", error);
    return null;
  }
}

/**
 * Update a thinking message with the actual response
 */
export async function updateThinkingMessage(
  channel: string,
  messageTs: string,
  text: string,
  blocks?: SlackBlock[],
): Promise<boolean> {
  return updateMessage(channel, messageTs, text, blocks);
}

// ============================================================================
// FILE HANDLING
// ============================================================================

/**
 * Download a file from Slack using the bot token
 * Returns the file content as a Buffer or base64 string
 */
export async function downloadSlackFile(
  url: string,
  expectedMimeType?: string,
): Promise<{ data: string; mimeType: string } | null> {
  if (!currentBotToken) {
    console.error("[Slack] Cannot download file - no bot token");
    return null;
  }

  try {
    console.log(`[Slack] Downloading file from: ${url.substring(0, 50)}...`);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${currentBotToken}`,
      },
    });

    if (!response.ok) {
      console.error(
        `[Slack] Failed to download file: ${response.status} ${response.statusText}`,
      );
      return null;
    }

    const contentType =
      response.headers.get("content-type") ?? "application/octet-stream";

    // Check if we got HTML instead of an image (usually auth error)
    if (contentType.includes("text/html")) {
      console.error(
        "[Slack] Download returned HTML instead of file - likely auth issue",
      );
      console.error("[Slack] Make sure your bot has 'files:read' scope");

      // If we know the expected mime type and it's an image, this is an error
      if (expectedMimeType && isImageFile(expectedMimeType)) {
        return null;
      }
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    // Always prefer expected mime type if provided, as Slack's file metadata is more reliable
    // than the Content-Type header from the download endpoint
    const finalMimeType = expectedMimeType || contentType;

    console.log(
      `[Slack] File downloaded: ${base64.length} chars, type: ${finalMimeType}${expectedMimeType ? ` (from metadata, server sent: ${contentType})` : ""}`,
    );

    return {
      data: base64,
      mimeType: finalMimeType,
    };
  } catch (error) {
    console.error("[Slack] Error downloading file:", error);
    return null;
  }
}

/**
 * Check if a file is an image that can be processed by vision models
 */
export function isImageFile(mimeType: string): boolean {
  const supportedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
  ];
  return supportedTypes.includes(mimeType.toLowerCase());
}

/**
 * Process files from a Slack message and convert to LLM-ready format
 */
export async function processSlackFiles(
  files: Array<{
    url_private: string;
    mimetype: string;
    name: string;
  }>,
): Promise<
  Array<{
    type: "image" | "audio";
    data: string;
    mimeType: string;
    name: string;
  }>
> {
  const processedFiles: Array<{
    type: "image" | "audio";
    data: string;
    mimeType: string;
    name: string;
  }> = [];

  for (const file of files) {
    const isImage = isImageFile(file.mimetype);
    const isAudio = file.mimetype.startsWith("audio/");
    
    console.log(`[Slack] Processing file:`, {
      name: file.name,
      mimetype: file.mimetype,
      isImage,
      isAudio,
      url_private_present: !!file.url_private,
    });
    
    // Process images and audio files
    if (!isImage && !isAudio) {
      console.log(
        `[Slack] Skipping unsupported file type: ${file.name} (${file.mimetype})`,
      );
      continue;
    }

    const downloaded = await downloadSlackFile(file.url_private, file.mimetype);
    if (downloaded) {
      processedFiles.push({
        type: isAudio ? "audio" : "image",
        data: downloaded.data,
        mimeType: downloaded.mimeType,
        name: file.name,
      });
      
      if (isAudio) {
        console.log(
          `[Slack] 🎵 Downloaded audio: ${file.name} (${downloaded.mimeType}, ${downloaded.data.length} chars)`,
        );
      } else {
        console.log(
          `[Slack] Downloaded image: ${file.name} (${downloaded.mimeType})`,
        );
      }
    }
  }

  return processedFiles;
}

// ============================================================================
// FILE UPLOAD
// ============================================================================

export interface UploadFileOptions {
  channels: string[];
  content?: string;
  filename: string;
  filetype?: string;
  title?: string;
  initialComment?: string;
  threadTs?: string;
}

/**
 * Upload a file to Slack
 */
export async function uploadFile(
  options: UploadFileOptions,
): Promise<{ ok: boolean; fileId?: string; error?: string }> {
  if (!webClient) {
    return { ok: false, error: "Client not initialized" };
  }

  try {
    const uploadArgs = {
      channel_id: options.channels[0],
      content: options.content ?? "",
      filename: options.filename,
      filetype: options.filetype,
      title: options.title,
      initial_comment: options.initialComment,
      thread_ts: options.threadTs,
    };

    const result = await withRateLimitRetry(
      () =>
        webClient!.files.uploadV2(
          uploadArgs as Parameters<WebClient["files"]["uploadV2"]>[0],
        ),
      "uploadFile",
    );

    const fileResult = result as { ok: boolean; file?: { id?: string } };
    if (fileResult.ok && fileResult.file) {
      return {
        ok: true,
        fileId: fileResult.file.id,
      };
    }

    return { ok: false, error: "Upload failed" };
  } catch (error) {
    console.error("[Slack] Failed to upload file:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// SCHEDULED MESSAGES
// ============================================================================

/**
 * Schedule a message to be sent later
 */
export async function scheduleMessage(
  channel: string,
  text: string,
  postAt: number, // Unix timestamp
  threadTs?: string,
): Promise<{ ok: boolean; scheduledMessageId?: string; error?: string }> {
  if (!webClient) {
    return { ok: false, error: "Client not initialized" };
  }

  try {
    const result = await withRateLimitRetry(
      () =>
        webClient!.chat.scheduleMessage({
          channel,
          text,
          post_at: postAt,
          thread_ts: threadTs,
        }),
      "scheduleMessage",
    );

    if (result.ok) {
      return {
        ok: true,
        scheduledMessageId: result.scheduled_message_id,
      };
    }

    return { ok: false, error: "Schedule failed" };
  } catch (error) {
    console.error("[Slack] Failed to schedule message:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Delete a scheduled message
 */
export async function deleteScheduledMessage(
  channel: string,
  scheduledMessageId: string,
): Promise<boolean> {
  if (!webClient) return false;

  try {
    await withRateLimitRetry(
      () =>
        webClient!.chat.deleteScheduledMessage({
          channel,
          scheduled_message_id: scheduledMessageId,
        }),
      "deleteScheduledMessage",
    );
    return true;
  } catch (error) {
    console.error("[Slack] Failed to delete scheduled message:", error);
    return false;
  }
}

// ============================================================================
// PIN MESSAGES
// ============================================================================

/**
 * Pin a message to a channel
 */
export async function pinMessage(
  channel: string,
  timestamp: string,
): Promise<boolean> {
  if (!webClient) return false;

  try {
    await withRateLimitRetry(
      () =>
        webClient!.pins.add({
          channel,
          timestamp,
        }),
      "pinMessage",
    );
    return true;
  } catch (error) {
    console.error("[Slack] Failed to pin message:", error);
    return false;
  }
}

/**
 * Unpin a message from a channel
 */
export async function unpinMessage(
  channel: string,
  timestamp: string,
): Promise<boolean> {
  if (!webClient) return false;

  try {
    await withRateLimitRetry(
      () =>
        webClient!.pins.remove({
          channel,
          timestamp,
        }),
      "unpinMessage",
    );
    return true;
  } catch (error) {
    console.error("[Slack] Failed to unpin message:", error);
    return false;
  }
}

// ============================================================================
// CONVERSATIONS (DM & INVITE)
// ============================================================================

/**
 * Open a direct message with a user
 */
export async function openDM(
  userId: string,
): Promise<{ ok: boolean; channelId?: string; error?: string }> {
  if (!webClient) {
    return { ok: false, error: "Client not initialized" };
  }

  try {
    const result = await withRateLimitRetry(
      () =>
        webClient!.conversations.open({
          users: userId,
        }),
      "openDM",
    );

    if (result.ok && result.channel) {
      return {
        ok: true,
        channelId: (result.channel as { id?: string }).id,
      };
    }

    return { ok: false, error: "Failed to open DM" };
  } catch (error) {
    console.error("[Slack] Failed to open DM:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Invite a user to a channel
 */
export async function inviteToChannel(
  channel: string,
  userId: string,
): Promise<boolean> {
  if (!webClient) return false;

  try {
    await withRateLimitRetry(
      () =>
        webClient!.conversations.invite({
          channel,
          users: userId,
        }),
      "inviteToChannel",
    );
    return true;
  } catch (error) {
    console.error("[Slack] Failed to invite user to channel:", error);
    return false;
  }
}
