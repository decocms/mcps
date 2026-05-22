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

/**
 * Safe JSON serialization for log lines. A logging call must never throw —
 * circular references, a throwing `toJSON`, or a bigint in the context would
 * otherwise crash the handler or mask the original error.
 *
 * `core` carries the authoritative level/ts/message (always plain strings, not
 * caller-supplied context values) so the fallback can never re-serialize a
 * poisoned value. The fallback itself is wrapped so it cannot throw either.
 */
function safeStringify(
  entry: Record<string, unknown>,
  core: { level: string; ts: string; message: string },
): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(entry, (_key, value) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) return "[Circular]";
        seen.add(value);
      }
      if (typeof value === "bigint") return value.toString();
      return value;
    });
  } catch (err) {
    try {
      return JSON.stringify({
        level: core.level,
        ts: core.ts,
        message: core.message,
        log_serialization_error: String(err),
      });
    } catch {
      // Ultimate fallback — built only from the safe string core fields.
      return JSON.stringify({
        level: core.level,
        ts: core.ts,
        message: "log serialization failed",
      });
    }
  }
}

function emit(level: string, message: string, ctx?: LogContext) {
  if (!shouldLog(level)) return;
  const ts = new Date().toISOString();
  // Spread ctx FIRST so it can never clobber the authoritative core fields.
  const entry = { ...ctx, level, ts, message };
  const line = safeStringify(entry, { level, ts, message });
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
