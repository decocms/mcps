import type { Env } from "./main.ts";
import {
  type QueueMessage,
  QueueMessageSchema,
} from "./collections/workflow.ts";
import { calculateBackoff, DEFAULT_RETRY_CONFIG } from "./lib/retry.ts";

const MAX_MESSAGE_AGE_MS = 24 * 60 * 60 * 1000;
const SAFETY_GUARD_DELAY_S = 60;

interface ExecutionResult {
  success: boolean;
  error?: string;
  shouldRetry?: boolean;
  retryDelaySeconds?: number;
}

async function callExecutionTool(
  env: Env,
  executionId: string,
  authorization: string,
  retryCount: number,
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
      body: JSON.stringify({ executionId, retryCount }),
    },
  );

  if (!response.ok) {
    const isRetryable = response.status >= 500 || response.status === 429;
    return {
      success: false,
      error: `HTTP ${response.status}`,
      shouldRetry: isRetryable,
      retryDelaySeconds:
        response.status === 429
          ? parseInt(response.headers.get("Retry-After") || "60", 10)
          : calculateBackoff(retryCount),
    };
  }

  return response.json();
}

async function processMessage(
  message: {
    body: QueueMessage;
    ack: () => void;
    retry: (opts?: { delaySeconds?: number }) => void;
  },
  env: Env,
): Promise<void> {
  const {
    executionId,
    retryCount = 0,
    enqueuedAt,
    authorization,
  } = message.body;
  const maxRetries = DEFAULT_RETRY_CONFIG.maxRetries;

  if (Date.now() - enqueuedAt > MAX_MESSAGE_AGE_MS) {
    console.warn(`[QUEUE] Dropping stale message: ${executionId}`);
    return message.ack();
  }

  if (retryCount === 0) {
    await env.WORKFLOW_QUEUE.send(
      { executionId, retryCount: 1, enqueuedAt: Date.now(), authorization },
      { delaySeconds: SAFETY_GUARD_DELAY_S },
    );
  }

  const result = await callExecutionTool(
    env,
    executionId,
    authorization,
    retryCount,
  );

  if (result.success) {
    return message.ack();
  }

  console.log(`[QUEUE] ${executionId} failed: ${result.error}`);

  if (!result.shouldRetry || retryCount >= maxRetries) {
    console.error(`[QUEUE] ${executionId} permanently failed`);
    return message.ack();
  }

  message.ack();
}

export async function handleWorkflowQueue(
  batch: MessageBatch<QueueMessage>,
  env: Env,
): Promise<void> {
  console.log(`[QUEUE] Processing ${batch.messages.length} messages`);

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
          ack: () => message.ack(),
          retry: (opts) => message.retry(opts),
        },
        env,
      );
    } catch (error) {
      console.error(`[QUEUE] Error:`, error);
      message.retry({ delaySeconds: 60 });
    }
  }
}
