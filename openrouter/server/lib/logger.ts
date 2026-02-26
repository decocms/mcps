/**
 * HyperDX Structured Logger for OpenRouter MCP
 *
 * Structured JSON logging with optional HyperDX ingestion.
 * No sensitive data (API keys, tokens) is ever logged.
 *
 * Environment variables:
 * - HYPERDX_API_KEY: enables direct ingestion to HyperDX (optional)
 * - LOG_LEVEL: "debug" | "info" | "warn" | "error" (default: "info")
 */

export interface LogContext {
  service?: string;
  level?: "info" | "warn" | "error" | "debug";
  requestId?: string;
  modelId?: string;
  state?: string;
  connectionId?: string;
  duration?: number;
  status?: number;
  error?: string;
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
  private service = "openrouter";
  private minLevel: LogLevel;
  private apiKey?: string;
  private hyperDxEndpoint = "https://in-otel.hyperdx.io/v1/logs";

  constructor(apiKey?: string) {
    const envLevel = (process.env.LOG_LEVEL ?? "info").toLowerCase();
    this.minLevel = (
      ["debug", "info", "warn", "error"].includes(envLevel) ? envLevel : "info"
    ) as LogLevel;
    this.apiKey = apiKey ?? process.env.HYPERDX_API_KEY;
  }

  info(message: string, context: Omit<LogContext, "level"> = {}) {
    this.log(message, { ...context, level: "info" });
  }

  warn(message: string, context: Omit<LogContext, "level"> = {}) {
    this.log(message, { ...context, level: "warn" });
  }

  error(message: string, context: Omit<LogContext, "level"> = {}) {
    this.log(message, { ...context, level: "error" });
  }

  debug(message: string, context: Omit<LogContext, "level"> = {}) {
    this.log(message, { ...context, level: "debug" });
  }

  private log(message: string, context: LogContext) {
    const level = context.level ?? "info";

    if (LOG_LEVELS[level] < LOG_LEVELS[this.minLevel]) {
      return;
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      service: this.service,
      body: message,
      ...context,
    };

    console.log(JSON.stringify(logEntry));

    if (this.apiKey) {
      this.sendToHyperDX(logEntry).catch(() => {
        // Silent: don't block on HyperDX failures
      });
    }
  }

  private async sendToHyperDX(logEntry: Record<string, unknown>) {
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

    if (!response.ok) {
      throw new Error(`HyperDX returned ${response.status}`);
    }
  }
}

export const logger = new HyperDXLogger();
