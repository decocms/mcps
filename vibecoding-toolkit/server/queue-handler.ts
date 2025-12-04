/**
 * Queue Handler
 *
 * Processes workflow execution messages from both:
 * - QStash webhooks (primary, via handleQStashWebhook)
 * - Cloudflare Queues (legacy, via handleWorkflowQueue)
 *
 * Uses the Scheduler abstraction for all re-queuing operations.
 */

import {
  type QueueMessage,
  QueueMessageSchema,
} from "./collections/workflow.ts";
import type { WorkflowExecutionResult } from "./workflow/types.ts";
import { calculateBackoff, DEFAULT_RETRY_CONFIG } from "./workflow/retry.ts";
import { createQStashScheduler, type Scheduler } from "./workflow/scheduler.ts";

const MAX_MESSAGE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// ============================================================================
// Shared Execution Logic
// ============================================================================

async function callExecutionTool(
  baseUrl: string,
  executionId: string,
  authorization: string,
): Promise<WorkflowExecutionResult> {
  const response = await fetch(`${baseUrl}/mcp/call-tool/EXECUTE_WORKFLOW`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authorization}`,
      "Content-Type": "application/json",
      "X-Deco-MCP-Client": "true",
    },
    body: JSON.stringify({ executionId }),
  });

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
  config: {
    qstashToken: string;
    baseUrl: string;
  },
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
  const result = await callExecutionTool(
    config.baseUrl,
    executionId,
    authorization,
  );

  // Create QStash scheduler for any re-scheduling needs
  const scheduler = createQStashScheduler({
    qstashToken: config.qstashToken,
    baseUrl: config.baseUrl,
  });

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
