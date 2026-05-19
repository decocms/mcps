/**
 * Structured logger for the Microsoft Teams MCP.
 *
 * - One log line = one JSON object → easy to parse in stdout/HyperDX/etc.
 * - Per-request trace_id correlates logs across the async pipeline
 *   (webhook receive → token fetch → Graph call → trigger publish).
 * - `logger.measure()` wraps an async operation and emits a single
 *   `completed` or `failed` log with the duration, removing boilerplate
 *   from call sites.
 */

const LOG_LEVEL = (process.env.LOG_LEVEL ?? "info").toLowerCase();

const LEVELS: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: string): boolean {
  return (LEVELS[level] ?? 1) >= (LEVELS[LOG_LEVEL] ?? 1);
}

export interface LogContext {
  connectionId?: string;
  teamId?: string;
  channelId?: string;
  chatId?: string;
  messageId?: string;
  trace_id?: string;
  duration_ms?: number;
  event_type?: string;
  resource?: string;
  error?: string;
  [key: string]: unknown;
}

function emit(level: string, message: string, ctx?: LogContext) {
  if (!shouldLog(level)) return;
  const entry = {
    level,
    ts: new Date().toISOString(),
    message,
    ...ctx,
  };
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

class StructuredLogger {
  debug(message: string, ctx?: LogContext) {
    emit("debug", message, ctx);
  }
  info(message: string, ctx?: LogContext) {
    emit("info", message, ctx);
  }
  warn(message: string, ctx?: LogContext) {
    emit("warn", message, ctx);
  }
  error(message: string, ctx?: LogContext) {
    emit("error", message, ctx);
  }

  /**
   * Generate a short trace id for correlating logs across an async pipeline.
   * Format: `teams-{ms}-{rand6}` — sortable by time, low collision rate.
   */
  generateTraceId(): string {
    return `teams-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Wrap an async operation: emits one log when it finishes (info on success,
   * error on throw), always including the duration. Returns the result.
   *
   * @example
   * const message = await logger.measure(
   *   () => getMessage(teamId, channelId, msgId, token),
   *   "Graph getMessage",
   *   { trace_id, teamId, channelId },
   * );
   */
  async measure<T>(
    fn: () => Promise<T>,
    label: string,
    ctx: LogContext = {},
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      this.info(`${label} completed`, {
        ...ctx,
        duration_ms: Date.now() - start,
      });
      return result;
    } catch (err) {
      this.error(`${label} failed`, {
        ...ctx,
        duration_ms: Date.now() - start,
        error: String(err),
      });
      throw err;
    }
  }
}

export const logger = new StructuredLogger();
