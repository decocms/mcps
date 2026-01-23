/**
 * Context Builder
 *
 * Handles building conversation context from Slack history
 * and formatting messages for LLM consumption.
 */

import { getThreadReplies, getChannelHistory } from "../../lib/slack-client.ts";

// Configuration for context building
let contextConfig = {
  maxMessagesBeforeSummary: 10,
  recentMessagesToKeep: 5,
  maxMessagesToFetch: 50,
};

let globalBotUserId: string | null = null;

export interface ContextConfig {
  maxMessagesBeforeSummary?: number;
  recentMessagesToKeep?: number;
  maxMessagesToFetch?: number;
}

export interface MessageWithImages {
  role: "user" | "assistant";
  content: string;
  images?: Array<{
    type: "image" | "audio";
    data: string;
    mimeType: string;
    name?: string;
  }>;
}

export interface ContextMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Configure context building parameters
 */
export function configureContext(config: ContextConfig): void {
  contextConfig = {
    maxMessagesBeforeSummary:
      config.maxMessagesBeforeSummary ?? contextConfig.maxMessagesBeforeSummary,
    recentMessagesToKeep:
      config.recentMessagesToKeep ?? contextConfig.recentMessagesToKeep,
    maxMessagesToFetch:
      config.maxMessagesToFetch ?? contextConfig.maxMessagesToFetch,
  };
  console.log("[ContextBuilder] Config updated", contextConfig);
}

/**
 * Set the bot user ID for message role detection
 */
export function setBotUserId(botUserId: string): void {
  globalBotUserId = botUserId;
  console.log("[ContextBuilder] Bot user ID set:", botUserId);
}

/**
 * Get current context configuration
 */
export function getContextConfig() {
  return { ...contextConfig };
}

/**
 * Check if context fetching is enabled
 */
export function isContextEnabled(): boolean {
  return contextConfig.maxMessagesToFetch > 0;
}

/**
 * Create a summary of older messages for context
 */
function summarizeOlderMessages(messages: ContextMessage[]): string {
  if (messages.length === 0) return "";

  const userMessages = messages.filter((m) => m.role === "user");
  const assistantMessages = messages.filter((m) => m.role === "assistant");

  const topics = userMessages.map((m) => m.content.slice(0, 100)).join("; ");

  const summary =
    `[Summary of ${messages.length} previous messages: ` +
    `${userMessages.length} from user, ${assistantMessages.length} from assistant. ` +
    `Topics discussed: ${topics.slice(0, 300)}${topics.length > 300 ? "..." : ""}]`;

  return summary;
}

/**
 * Build context messages from Slack thread or channel history
 * For long threads, summarizes older messages
 */
export async function buildContextMessages(
  channel: string,
  threadTs: string | undefined,
  currentTs: string,
  limit: number = contextConfig.maxMessagesToFetch,
): Promise<ContextMessage[]> {
  const messages: ContextMessage[] = [];

  // Fetch messages from Slack
  let allMessages: Array<{ user?: string; text: string; ts: string }> = [];

  if (threadTs) {
    const threadMessages = await getThreadReplies(
      channel,
      threadTs,
      contextConfig.maxMessagesToFetch,
    );
    allMessages = threadMessages
      .filter((msg) => msg.ts !== currentTs && msg.text)
      .sort((a, b) => Number.parseFloat(a.ts) - Number.parseFloat(b.ts));
  } else {
    const channelMessages = await getChannelHistory(channel, {
      limit: contextConfig.maxMessagesToFetch,
      latest: currentTs,
    });
    allMessages = channelMessages
      .filter((msg) => msg.ts !== currentTs && msg.text)
      .sort((a, b) => Number.parseFloat(a.ts) - Number.parseFloat(b.ts));
  }

  // Convert to role-based messages
  const roleMessages: ContextMessage[] = allMessages.map((msg) => ({
    role: (msg.user === globalBotUserId ? "assistant" : "user") as
      | "user"
      | "assistant",
    content: msg.text,
  }));

  // Check if we need to summarize
  if (roleMessages.length > contextConfig.maxMessagesBeforeSummary) {
    const recentCount = contextConfig.recentMessagesToKeep;
    const olderMessages = roleMessages.slice(0, -recentCount);
    const recentMessages = roleMessages.slice(-recentCount);

    const summary = summarizeOlderMessages(olderMessages);
    if (summary) {
      messages.push({ role: "user", content: summary });
    }

    messages.push(...recentMessages);

    console.log(
      `[ContextBuilder] ${olderMessages.length} msgs summarized, ${recentMessages.length} kept`,
    );
  } else {
    messages.push(...roleMessages.slice(-limit));
  }

  return messages;
}

/**
 * Format messages with clear context/request separation for LLM
 */
export function formatMessagesForLLM(
  contextMessages: ContextMessage[],
  currentContent: string,
  media?: Array<{
    type: "image" | "audio";
    data: string;
    mimeType: string;
    name: string;
  }>,
): MessageWithImages[] {
  const allMessages: MessageWithImages[] = [];

  // Add context with explicit markers (if any)
  if (contextMessages.length > 0) {
    allMessages.push({
      role: "user",
      content:
        "<previous_conversation>\n" +
        "The messages below are the previous conversation history for context. " +
        "Respond ONLY to <current_request>, use the context only to understand the conversation.\n" +
        "</previous_conversation>",
    });
    allMessages.push(...contextMessages);
    allMessages.push({
      role: "user",
      content: "<end_previous_conversation>",
    });
  }

  // Add current request with explicit marker
  allMessages.push({
    role: "user",
    content: `<current_request>\n${currentContent}\n</current_request>`,
    images: media && media.length > 0 ? media : undefined,
  });

  return allMessages;
}

/**
 * Clean bot mention from text
 */
export function cleanBotMention(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/g, "").trim();
}

/**
 * Build current content with image indicator
 */
export function buildCurrentContent(
  text: string,
  mediaCount: number,
  cleanMention: boolean = false,
): string {
  const cleanedText = cleanMention ? cleanBotMention(text) : text;
  return (
    cleanedText + (mediaCount > 0 ? ` [${mediaCount} file(s) attached]` : "")
  );
}
