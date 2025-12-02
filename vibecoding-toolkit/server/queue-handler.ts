/**
 * Queue Handler
 *
 * Processes workflow execution messages from both:
 * - QStash webhooks (primary, via handleQStashWebhook)
 * - Cloudflare Queues (legacy, via handleWorkflowQueue)
 *
 * Uses the Scheduler abstraction for all re-queuing operations.
 */

import type { Env } from "./main.ts";
import {
  type QueueMessage,
  QueueMessageSchema,
} from "./collections/workflow.ts";
import type { WorkflowExecutionResult } from "./workflow/types.ts";
import { calculateBackoff, DEFAULT_RETRY_CONFIG } from "./workflow/retry.ts";
import { createQStashScheduler, type Scheduler } from "./lib/scheduler.ts";

const MAX_MESSAGE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// ============================================================================
// Shared Execution Logic
// ============================================================================

async function callExecutionTool(
  env: Env,
  executionId: string,
  authorization: string,
): Promise<WorkflowExecutionResult> {
  const response = await fetch(
    `${env.DECO_APP_ENTRYPOINT}/mcp/call-tool/EXECUTE_WORKFLOW`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authorization}`,
        "Content-Type": "application/json",
        "X-Deco-MCP-Client": "true",
      },
      body: JSON.stringify({ executionId }),
    },
  );

  if (!response.ok) {
    return {
      status: "failed",
      error: `HTTP ${response.status}: ${await response.text()}`,
      retryable: response.status >= 500 || response.status === 429,
      retryDelaySeconds:
        response.status === 429
          ? parseInt(response.headers.get("Retry-After") || "60", 10)
          : 60,
    };
  }

  return response.json();
}

async function handleExecutionResult(
  result: WorkflowExecutionResult,
  executionId: string,
  authorization: string,
  retryCount: number,
  scheduler: Scheduler,
): Promise<{ needsRetry: boolean; retryDelayMs?: number }> {
  switch (result.status) {
    case "completed":
      console.log(`[QUEUE] ${executionId} completed successfully`);
      return { needsRetry: false };

    case "cancelled":
      console.log(`[QUEUE] ${executionId} was cancelled`);
      return { needsRetry: false };

    case "waiting_for_signal":
      // Don't re-queue - signal handler will wake it
      console.log(
        `[QUEUE] ${executionId} waiting for signal '${result.signalName}'`,
      );
      return { needsRetry: false };

    case "sleeping":
      // Schedule wake-up at the specified time
      console.log(
        `[QUEUE] ${executionId} sleeping until ${new Date(result.wakeAtEpochMs).toISOString()}`,
      );
      await scheduler.scheduleAt(executionId, result.wakeAtEpochMs, {
        authorization,
        retryCount: 0, // Reset retry count for sleep wake-ups
      });
      return { needsRetry: false };

    case "failed":
      if (result.retryable && retryCount < DEFAULT_RETRY_CONFIG.maxRetries) {
        const delayMs =
          (result.retryDelaySeconds ?? calculateBackoff(retryCount)) * 1000;
        console.log(
          `[QUEUE] ${executionId} failed, retrying in ${delayMs}ms (attempt ${retryCount + 1})`,
        );
        await scheduler.scheduleAfter(executionId, delayMs, {
          authorization,
          retryCount: retryCount + 1,
        });
        return { needsRetry: false }; // Scheduler handles the retry
      } else {
        console.error(
          `[QUEUE] ${executionId} failed permanently: ${result.error}`,
        );
        return { needsRetry: false };
      }

    default:
      const _exhaustive: never = result;
      console.error(`[QUEUE] Unknown result status:`, _exhaustive);
      return { needsRetry: false };
  }
}

// ============================================================================
// QStash Webhook Handler
// ============================================================================

export interface QStashWebhookResult {
  success: boolean;
  error?: string;
  retryable?: boolean;
}

/**
 * Handle incoming QStash webhook message
 *
 * This is called from main.ts after signature verification.
 * Returns a result that determines the HTTP response status.
 */
export async function handleQStashWebhook(
  body: string,
  env: Env,
): Promise<QStashWebhookResult> {
  console.log(`[QSTASH] Processing webhook message`);

  // Parse the message
  let message: QueueMessage;
  try {
    const parsed = JSON.parse(body);
    const validated = QueueMessageSchema.safeParse(parsed);

    if (!validated.success) {
      console.error(`[QSTASH] Invalid message format:`, validated.error);
      return {
        success: false,
        error: "Invalid message format",
        retryable: false, // Don't retry malformed messages
      };
    }

    message = validated.data;
  } catch (error) {
    console.error(`[QSTASH] Failed to parse message body:`, error);
    return {
      success: false,
      error: "Failed to parse JSON",
      retryable: false,
    };
  }

  const { executionId, retryCount = 0, enqueuedAt, authorization } = message;

  // Check message age
  if (Date.now() - enqueuedAt > MAX_MESSAGE_AGE_MS) {
    console.warn(`[QSTASH] Dropping stale message: ${executionId}`);
    return {
      success: true, // Return success to prevent QStash retry
    };
  }

  // Execute the workflow
  const result = await callExecutionTool(env, executionId, authorization);

  // Create QStash scheduler for any re-scheduling needs
  const scheduler = createQStashScheduler(env);

  // Handle the result
  const { needsRetry } = await handleExecutionResult(
    result,
    executionId,
    authorization,
    retryCount,
    scheduler,
  );

  if (needsRetry) {
    // This shouldn't happen since handleExecutionResult schedules retries itself
    return {
      success: false,
      error: result.status === "failed" ? result.error : "Needs retry",
      retryable: true,
    };
  }

  return { success: true };
}

// ============================================================================
// Cloudflare Queue Handler (Legacy)
// ============================================================================

async function processMessage(
  message: Message<QueueMessage>,
  env: Env,
  scheduler: Scheduler,
): Promise<void> {
  const {
    executionId,
    retryCount = 0,
    enqueuedAt,
    authorization,
  } = message.body;

  if (Date.now() - enqueuedAt > MAX_MESSAGE_AGE_MS) {
    console.warn(`[QUEUE] Dropping stale message: ${executionId}`);
    message.ack();
    return;
  }

  const result = await callExecutionTool(env, executionId, authorization);

  await handleExecutionResult(
    result,
    executionId,
    authorization,
    retryCount,
    scheduler,
  );

  message.ack();
}

/**
 * Main queue handler entry point (Legacy Cloudflare Queues)
 *
 * Kept for backward compatibility during migration to QStash.
 */
export async function handleWorkflowQueue(
  batch: MessageBatch<QueueMessage>,
  env: Env,
): Promise<void> {
  console.log(
    `[QUEUE] Processing ${batch.messages.length} messages (CF Queue)`,
  );

  // Use QStash scheduler (or CF Queue if available for backward compat)
  const scheduler = createQStashScheduler(env);

  for (const message of batch.messages) {
    const parsed = QueueMessageSchema.safeParse(message.body);

    if (!parsed.success) {
      console.error(`[QUEUE] Invalid message:`, parsed.error);
      message.ack();
      continue;
    }

    try {
      await processMessage(
        {
          body: parsed.data,
          id: message.id,
          timestamp: message.timestamp,
          attempts: message.attempts,
          ack: () => message.ack(),
          retry: (opts) => message.retry(opts),
        },
        env,
        scheduler,
      );
    } catch (error) {
      console.error(`[QUEUE] Unexpected error:`, error);
      message.retry({ delaySeconds: 60 });
    }
  }
}
