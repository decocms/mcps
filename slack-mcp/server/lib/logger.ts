/**
 * Slack Logger - Sends important logs to a Slack channel
 */

import { sendMessage } from "./slack-client.ts";

let logChannelId: string | null = null;
let loggingEnabled = false;
let webhookProcessingPaused = false; // Pause logging during webhook processing to prevent loops

// TEMPORARILY DISABLED: Slack logging causes infinite loops
// TODO: Re-enable when we have proper filtering at Mesh level
const SLACK_LOGGING_DISABLED = true;

export function configureLogger(config: { channelId?: string }): void {
  if (SLACK_LOGGING_DISABLED) {
    loggingEnabled = false;
    console.log("[Logger] Slack logging DISABLED to prevent infinite loops");
    console.log("[Logger] Logs will only go to console");
    return;
  }

  if (config.channelId) {
    logChannelId = config.channelId;
    loggingEnabled = true;
    console.log(`[Logger] Logging enabled to channel: ${logChannelId}`);
  } else {
    loggingEnabled = false;
    console.log("[Logger] Logging disabled - no LOG_CHANNEL_ID configured");
  }
}

export function isLoggingEnabled(): boolean {
  return loggingEnabled && !!logChannelId && !webhookProcessingPaused;
}

/**
 * Pause Slack logging during webhook processing to prevent infinite loops
 */
export function pauseSlackLogging(): void {
  webhookProcessingPaused = true;
}

/**
 * Resume Slack logging after webhook processing
 */
export function resumeSlackLogging(): void {
  webhookProcessingPaused = false;
}

type LogLevel = "info" | "warn" | "error" | "success";

const EMOJI_MAP: Record<LogLevel, string> = {
  info: "ℹ️",
  warn: "⚠️",
  error: "❌",
  success: "✅",
};

/**
 * Send a log message to the configured Slack channel
 */
export async function logToSlack(
  level: LogLevel,
  title: string,
  details?: string | Record<string, unknown>,
): Promise<void> {
  // Always log to console
  const consoleMethod = level === "error" ? console.error : console.log;
  consoleMethod(`[${level.toUpperCase()}] ${title}`, details ?? "");

  // Send to Slack if enabled and not paused (to prevent loops during webhook processing)
  if (!loggingEnabled || !logChannelId || webhookProcessingPaused) {
    return;
  }

  try {
    const emoji = EMOJI_MAP[level];
    let text = `${emoji} *${title}*`;

    if (details) {
      if (typeof details === "string") {
        text += `\n\`\`\`${details}\`\`\``;
      } else {
        text += `\n\`\`\`${JSON.stringify(details, null, 2)}\`\`\``;
      }
    }

    await sendMessage({
      channel: logChannelId,
      text,
      mrkdwn: true,
    });
  } catch (error) {
    // Don't fail if logging fails - just console log
    console.error("[Logger] Failed to send log to Slack:", error);
  }
}

// Convenience methods
export const logger = {
  info: (title: string, details?: string | Record<string, unknown>) =>
    logToSlack("info", title, details),

  warn: (title: string, details?: string | Record<string, unknown>) =>
    logToSlack("warn", title, details),

  error: (title: string, details?: string | Record<string, unknown>) =>
    logToSlack("error", title, details),

  success: (title: string, details?: string | Record<string, unknown>) =>
    logToSlack("success", title, details),

  // Debug log - for detailed debugging in production
  debug: (title: string, details?: string | Record<string, unknown>) =>
    logToSlack("info", `🔍 ${title}`, details),

  // Special method for webhook events
  webhookReceived: (eventType: string, teamId?: string) =>
    logToSlack("info", "Webhook Received", {
      eventType,
      teamId: teamId ?? "unknown",
      timestamp: new Date().toISOString(),
    }),

  // Webhook processing steps
  webhookProcessing: (step: string, details?: Record<string, unknown>) =>
    logToSlack("info", `📥 ${step}`, {
      ...details,
      timestamp: new Date().toISOString(),
    }),

  // Special method for errors
  webhookError: (error: string, context?: Record<string, unknown>) =>
    logToSlack("error", "Webhook Error", {
      error,
      ...context,
      timestamp: new Date().toISOString(),
    }),

  // Event handling
  eventReceived: (
    eventType: string,
    details: { user?: string; channel?: string; text?: string },
  ) =>
    logToSlack("info", `📨 Event: ${eventType}`, {
      ...details,
      timestamp: new Date().toISOString(),
    }),

  eventHandled: (eventType: string) =>
    logToSlack("success", `Event Handled: ${eventType}`),

  eventError: (eventType: string, error: string) =>
    logToSlack("error", `Event Error: ${eventType}`, { error }),

  // Message handling
  messageReceived: (channel: string, user: string, text: string) =>
    logToSlack("info", "💬 Message Received", {
      channel,
      user,
      text: text.substring(0, 200) + (text.length > 200 ? "..." : ""),
    }),

  messageSent: (channel: string, text: string) =>
    logToSlack("success", "📤 Message Sent", {
      channel,
      text: text.substring(0, 200) + (text.length > 200 ? "..." : ""),
    }),

  // Connection status
  connected: (teamId: string, botUserId: string) =>
    logToSlack("success", "Bot Connected", {
      teamId,
      botUserId,
      timestamp: new Date().toISOString(),
    }),

  disconnected: (reason?: string) =>
    logToSlack("warn", "Bot Disconnected", {
      reason: reason ?? "Unknown",
      timestamp: new Date().toISOString(),
    }),

  // Config changes
  configReceived: (details: Record<string, unknown>) =>
    logToSlack("info", "⚙️ Config Received", details),
};
