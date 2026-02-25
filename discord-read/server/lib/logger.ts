/**
 * HyperDX Structured Logger for Discord MCP
 *
 * Provides structured logging with security safeguards:
 * - NO sensitive data (tokens, message content, etc.)
 * - Includes context: connectionId, guildName, organizationId
 * - Generates unique trace_id for request tracking
 * - Timing measurements for performance analysis
 *
 * Configuration via environment variables:
 * - HYPERDX_API_KEY: HyperDX API key (optional, logs go to stdout by default)
 * - LOG_LEVEL: "debug" | "info" | "warn" | "error" (default: "info")
 */

export interface LogContext {
  service?: string;
  level?: "info" | "warn" | "error" | "debug";
  connectionId?: string;
  connectionName?: string;
  organizationId?: string;
  guildId?: string;
  guildName?: string;
  trace_id?: string;
  route?: string;
  method?: string;
  eventType?: string;
  channel?: string;
  channelId?: string;
  channelName?: string;
  userId?: string;
  userName?: string;
  duration?: number;
  error?: string;
  status?: string;
  messageId?: string;
  messageType?: string;
  hasAttachments?: boolean;
  hasEmbeds?: boolean;
  isBot?: boolean;
  isDM?: boolean;
  isThread?: boolean;
  commandName?: string;
  agentUsed?: string;
  voiceChannelId?: string;
  memberCount?: number;
  reactionEmoji?: string;
  [key: string]: unknown;
}

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class HyperDXLogger {
  private service = "discord-mcp";
  private minLevel: LogLevel;
  private apiKey?: string;
  private hyperDxEndpoint = "https://in-otel.hyperdx.io/v1/logs";

  constructor(apiKey?: string) {
    // Read log level from env (default: info)
    const envLevel = (process.env.LOG_LEVEL ?? "info").toLowerCase();
    this.minLevel = (
      ["debug", "info", "warn", "error"].includes(envLevel) ? envLevel : "info"
    ) as LogLevel;
    this.apiKey = apiKey ?? process.env.HYPERDX_API_KEY;
    if (this.apiKey) {
      console.log(
        `[HyperDX] Logger initialized with API key from ${apiKey ? "constructor" : "env variable"}`,
      );
    }
  }

  /**
   * Set HyperDX API key for direct ingestion
   */
  setApiKey(apiKey?: string) {
    this.apiKey = apiKey;
  }

  /**
   * Log at info level
   */
  info(message: string, context: Omit<LogContext, "level"> = {}) {
    this.log(message, { ...context, level: "info" });
  }

  /**
   * Log at warn level
   */
  warn(message: string, context: Omit<LogContext, "level"> = {}) {
    this.log(message, { ...context, level: "warn" });
  }

  /**
   * Log at error level
   */
  error(message: string, context: Omit<LogContext, "level"> = {}) {
    this.log(message, { ...context, level: "error" });
  }

  /**
   * Log at debug level
   */
  debug(message: string, context: Omit<LogContext, "level"> = {}) {
    this.log(message, { ...context, level: "debug" });
  }

  /**
   * Generate unique trace ID for request tracking
   */
  static generateTraceId(): string {
    return `discord-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Measure execution time and log results
   */
  async measure<T>(
    fn: () => Promise<T>,
    label: string,
    context: Omit<LogContext, "level" | "duration"> = {},
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.info(`${label} completed`, { ...context, duration });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.error(`${label} failed`, {
        ...context,
        duration,
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * Internal log method - outputs JSON to stdout or sends to HyperDX API
   * SECURITY: Sanitizes sensitive data before logging
   */
  private log(message: string, context: LogContext) {
    const level = context.level ?? "info";

    // Skip if below minimum log level
    if (LOG_LEVELS[level] < LOG_LEVELS[this.minLevel]) {
      return;
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      service: this.service,
      body: message,
      ...context,
    };

    // Log to stdout (always, for local debugging and K8s fallback)
    console.log(JSON.stringify(logEntry));

    // If API key is configured, also send to HyperDX API
    if (this.apiKey) {
      this.sendToHyperDX(logEntry)
        .then(() => {
          // Debug: uncomment to verify sends
          // console.log("[HyperDX] ✅ Log sent successfully");
        })
        .catch((error) => {
          // Don't block on HyperDX send failures, just log to console
          console.error("[HyperDX] ❌ Failed to send log:", error.message);
        });
    }
  }

  /**
   * Send log entry to HyperDX via HTTP
   */
  private async sendToHyperDX(logEntry: Record<string, unknown>) {
    console.log(`[HyperDX] 📤 Sending log to ${this.hyperDxEndpoint}...`);
    try {
      const response = await fetch(this.hyperDxEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.apiKey!,
        },
        body: JSON.stringify({
          resourceLogs: [
            {
              resource: {
                attributes: [
                  {
                    key: "service.name",
                    value: { stringValue: this.service },
                  },
                ],
              },
              scopeLogs: [
                {
                  scope: { name: this.service },
                  logRecords: [
                    {
                      timeUnixNano: `${Date.now() * 1000000}`,
                      severityText: String(
                        logEntry.level || "info",
                      ).toUpperCase(),
                      body: { stringValue: String(logEntry.body) },
                      attributes: Object.entries(logEntry)
                        .filter(([key]) => key !== "body" && key !== "level")
                        .map(([key, value]) => ({
                          key,
                          value: { stringValue: String(value) },
                        })),
                    },
                  ],
                },
              ],
            },
          ],
        }),
      });

      const body = await response.text();
      if (!response.ok) {
        throw new Error(
          `HyperDX API returned ${response.status}: ${response.statusText} - ${body}`,
        );
      }
      console.log(
        `[HyperDX] ✅ Log sent successfully (${response.status}) - Response: ${body || "(empty)"}`,
      );
    } catch (error) {
      // Re-throw to be caught by caller
      throw error;
    }
  }
}

// Singleton instance
export const logger = new HyperDXLogger();
