/**
 * Durable Queue Handler
 *
 * Handles workflow execution messages from Cloudflare Queues with:
 * - Processing ALL messages in batch (no early return)
 * - Explicit ack/retry per message
 * - Proper error isolation between messages
 * - Exponential backoff for retries
 * - Stale message detection
 * - Safety guard pattern (Pattern #9 from durable package)
 *
 * IMPORTANT: The queue handler runs in a different context where env.DATABASE
 * is NOT available. ALL database operations must happen via the MCP tool
 * (called via HTTP fetch). The queue handler only orchestrates retries.
 *
 * @see docs/WORKFLOW_EXECUTION_DESIGN.md Section 4.2
 * @see docs/IMPLEMENTATION_GUIDE.md "Fix 1: Process All Queue Messages"
 * @see docs/DURABLE_PATTERNS.md Pattern #9: Safety Guard
 */

import type { Env } from "./main.ts";
import {
  type QueueMessage,
  QueueMessageSchema,
} from "./collections/workflow.ts";
import {
  calculateBackoff,
  DEFAULT_RETRY_CONFIG,
  isRetryableError,
} from "./lib/retry.ts";

/**
 * Queue handler configuration
 */
export interface QueueHandlerConfig {
  /** Maximum age of a message before it's considered stale (ms). Default: 24 hours */
  maxMessageAgeMs?: number;
  /** Maximum number of retries before marking execution as failed. Default: 10 */
  maxRetries?: number;
  /** Whether to log verbose output. Default: true */
  verbose?: boolean;
  /** Safety guard delay in seconds (Pattern #9). Default: 60 */
  safetyGuardDelaySeconds?: number;
  /** Whether to enable safety guard scheduling. Default: true */
  enableSafetyGuard?: boolean;
}

const DEFAULT_CONFIG: Required<QueueHandlerConfig> = {
  maxMessageAgeMs: 24 * 60 * 60 * 1000, // 24 hours
  maxRetries: DEFAULT_RETRY_CONFIG.maxRetries,
  verbose: true,
  safetyGuardDelaySeconds: 60,
  enableSafetyGuard: true,
};

/**
 * Message batch from Cloudflare Queue
 */
export interface MessageBatch<T> {
  messages: Array<{
    body: T;
    ack: () => void;
    retry: (options?: { delaySeconds?: number }) => void;
  }>;
}

/**
 * Result from the MCP tool execution
 */
interface ExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  shouldRetry?: boolean;
  retryDelaySeconds?: number;
}

/**
 * Call the workflow execution tool via HTTP.
 *
 * Since env.SELF is not available in the queue handler context,
 * we must call the MCP endpoint via HTTP fetch.
 *
 * @param env - Environment
 * @param executionId - The execution ID to process
 * @param authorization - Authorization token
 * @param retryCount - Current retry count
 * @returns Execution result
 */
async function callExecutionTool(
  env: Env,
  executionId: string,
  authorization: string,
  retryCount: number = 0,
): Promise<ExecutionResult> {
  const response = await fetch(
    `${env.DECO_APP_ENTRYPOINT}/mcp/call-tool/START_EXECUTION`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authorization}`,
        "Content-Type": "application/json",
        "X-Deco-MCP-Client": "true",
      },
      body: JSON.stringify({
        executionId,
        retryCount,
      }),
    },
  );

  if (!response.ok) {
    // Check if it's a retryable HTTP error
    const isServerError = response.status >= 500 && response.status < 600;
    const isRateLimit = response.status === 429;

    return {
      success: false,
      error: `HTTP ${response.status}: ${response.statusText}`,
      shouldRetry: isServerError || isRateLimit,
      retryDelaySeconds: isRateLimit
        ? parseInt(response.headers.get("Retry-After") || "60", 10)
        : calculateBackoff(retryCount),
    };
  }

  try {
    const data = (await response.json()) as ExecutionResult;
    return data;
  } catch (parseError) {
    return {
      success: false,
      error: `Failed to parse response: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
      shouldRetry: false,
    };
  }
}

/**
 * Process a single queue message.
 *
 * NOTE: All database operations (retry tracking, status updates) happen
 * inside the MCP tool called via HTTP. The queue handler only orchestrates
 * message acknowledgment and retry scheduling.
 *
 * @param message - The queue message
 * @param env - Environment
 * @param config - Handler configuration
 */
async function processMessage(
  message: {
    body: QueueMessage;
    ack: () => void;
    retry: (options?: { delaySeconds?: number }) => void;
  },
  env: Env,
  config: Required<QueueHandlerConfig>,
): Promise<void> {
  const {
    executionId,
    retryCount = 0,
    enqueuedAt,
    authorization,
  } = message.body;

  try {
    // 1. Check if message is stale
    if (Date.now() - enqueuedAt > config.maxMessageAgeMs) {
      console.warn(
        `[QUEUE] Dropping stale message for ${executionId} (age: ${Date.now() - enqueuedAt}ms)`,
      );
      message.ack();
      return;
    }

    // 2. Safety Guard Pattern (Pattern #9 from durable package)
    // Schedule a retry BEFORE starting work. This ensures the workflow
    // will execute even if this worker crashes during processing.
    //
    // IMPORTANT: Only schedule for initial messages (retryCount === 0).
    // Retry messages (retryCount > 0) are THEMSELVES safety guards - if they
    // crash, orphan recovery will handle it. This prevents infinite safety
    // guard loops for completed executions.
    const shouldScheduleSafetyGuard =
      config.enableSafetyGuard && retryCount === 0;

    if (shouldScheduleSafetyGuard) {
      const safetyMessage: QueueMessage = {
        executionId,
        retryCount: retryCount + 1,
        enqueuedAt: Date.now(),
        authorization,
      };

      await env.WORKFLOW_QUEUE.send(safetyMessage, {
        delaySeconds: config.safetyGuardDelaySeconds,
      });

      if (config.verbose) {
        console.log(
          `[QUEUE] Safety guard scheduled for ${executionId} in ${config.safetyGuardDelaySeconds}s`,
        );
      }
    }

    // 3. Execute workflow via HTTP call to MCP tool
    // The tool handles all DB operations (status updates, retry tracking)
    const result = await callExecutionTool(
      env,
      executionId,
      authorization,
      retryCount,
    );

    // 4. Handle success - just ack, tool already updated DB
    if (result.success) {
      if (config.verbose) {
        console.log(`[QUEUE] Execution ${executionId} completed successfully`);
      }
      message.ack();
      return;
    }

    // 5. Handle failure - tool already tracked the error in DB
    if (config.verbose) {
      console.log(`[QUEUE] Execution ${executionId} failed: ${result.error}`);
    }

    // 6. Check if we should retry (safety guard already scheduled, so just ack)
    if (result.shouldRetry && retryCount < config.maxRetries) {
      if (config.enableSafetyGuard) {
        // Safety guard already scheduled, just log and ack
        if (config.verbose) {
          console.log(
            `[QUEUE] Execution ${executionId} failed, safety guard will retry: ${result.error}`,
          );
        }
        message.ack();
        return;
      }

      // Fallback: manual retry if safety guard disabled
      const delaySeconds =
        result.retryDelaySeconds ?? calculateBackoff(retryCount);

      if (config.verbose) {
        console.log(
          `[QUEUE] Execution ${executionId} failed, retrying in ${delaySeconds}s (attempt ${retryCount + 1}): ${result.error}`,
        );
      }

      message.retry({ delaySeconds });
      return;
    }

    // 7. Max retries exceeded or non-retryable error
    console.error(
      `[QUEUE] Execution ${executionId} permanently failed: ${result.error}`,
    );
    message.ack(); // Don't retry forever
  } catch (error) {
    console.error(`[QUEUE] Unexpected error processing ${executionId}:`, error);

    // Check retry limits
    if (retryCount >= config.maxRetries) {
      console.error(
        `[QUEUE] Execution ${executionId} exceeded max retries (${config.maxRetries})`,
      );
      message.ack();
      return;
    }

    // Check if error is retryable
    const shouldRetry = isRetryableError(error);

    if (shouldRetry) {
      if (config.enableSafetyGuard) {
        // Safety guard already scheduled
        message.ack();
      } else {
        // Retry with exponential backoff
        const delaySeconds = calculateBackoff(retryCount);
        console.log(
          `[QUEUE] Retrying ${executionId} in ${delaySeconds}s (attempt ${retryCount + 1})`,
        );
        message.retry({ delaySeconds });
      }
    } else {
      console.error(
        `[QUEUE] Non-retryable error for ${executionId}, marking as failed`,
      );
      message.ack();
    }
  }
}

/**
 * Queue handler for workflow execution messages.
 *
 * This handler:
 * - Processes ALL messages in the batch (no early return)
 * - Isolates errors between messages
 * - Uses explicit ack/retry for each message
 * - Implements exponential backoff for retries
 * - Calls MCP tool via HTTP (env.SELF not available in queue context)
 *
 * @param batch - Message batch from Cloudflare Queue
 * @param env - Environment
 * @param config - Handler configuration
 */
export async function handleWorkflowQueue(
  batch: MessageBatch<QueueMessage>,
  env: Env,
  config: QueueHandlerConfig = {},
): Promise<void> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  console.log(`[QUEUE] Processing batch of ${batch.messages.length} messages`);

  // Process ALL messages - no early return
  for (const message of batch.messages) {
    try {
      // Parse and validate message
      const parseResult = QueueMessageSchema.safeParse(message.body);

      if (!parseResult.success) {
        console.error(`[QUEUE] Invalid message format:`, parseResult.error);
        message.ack(); // Don't retry malformed messages
        continue;
      }

      await processMessage(
        {
          body: parseResult.data,
          ack: () => message.ack(),
          retry: (options) => message.retry(options),
        },
        env,
        mergedConfig,
      );
    } catch (error) {
      // This should rarely happen - processMessage handles its own errors
      console.error(`[QUEUE] Unhandled error in message processing:`, error);

      // Try to retry with a default delay
      try {
        message.retry({ delaySeconds: 60 });
      } catch (retryError) {
        // If retry fails, just log it
        console.error(`[QUEUE] Failed to retry message:`, retryError);
      }
    }
  }

  console.log(`[QUEUE] Finished processing batch`);
}

/**
 * Create a queue handler with custom configuration.
 *
 * @param config - Handler configuration
 * @returns Configured queue handler
 */
export function createQueueHandler(config: QueueHandlerConfig = {}) {
  return (batch: MessageBatch<QueueMessage>, env: Env) =>
    handleWorkflowQueue(batch, env, config);
}
