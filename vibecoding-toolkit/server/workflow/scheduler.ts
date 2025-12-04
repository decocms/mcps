import { Client as QStashClient, Receiver } from "@upstash/qstash";
import type { QueueMessage } from "../collections/workflow.ts";

export interface Scheduler {
  schedule(executionId: string, options: ScheduleOptions): Promise<void>;

  scheduleAfter(
    executionId: string,
    delayMs: number,
    options: ScheduleOptions,
  ): Promise<void>;

  scheduleAt(
    executionId: string,
    wakeAtEpochMs: number,
    options: ScheduleOptions,
  ): Promise<void>;
}

export interface ScheduleOptions {
  authorization: string;
  retryCount?: number;
}
export interface QStashSchedulerOptions {
  /** QStash API token for authentication */
  token: string;
  /** The destination URL that QStash will call (your webhook endpoint) */
  destinationUrl: string;
}

/**
 * QStash implementation of Scheduler
 *
 * Uses Upstash QStash for durable, serverless message scheduling.
 * Supports delays up to 7 days via HTTP API.
 *
 * @see https://upstash.com/docs/qstash/howto/publishing
 */
export class QStashScheduler implements Scheduler {
  // QStash max delay is 7 days (604800 seconds)
  private readonly MAX_DELAY_SECONDS = 7 * 24 * 60 * 60;

  private readonly client: QStashClient;
  private readonly destinationUrl: string;

  constructor(options: QStashSchedulerOptions) {
    this.client = new QStashClient({ token: options.token });
    this.destinationUrl = options.destinationUrl;
  }

  async schedule(executionId: string, options: ScheduleOptions): Promise<void> {
    const message: QueueMessage = {
      executionId,
      retryCount: options.retryCount ?? 0,
      enqueuedAt: Date.now(),
      authorization: options.authorization,
    };

    await this.client.publishJSON({
      url: this.destinationUrl,
      body: message,
      retries: 3,
    });

    console.log(`[QSTASH] Scheduled ${executionId} immediately`);
  }

  async scheduleAfter(
    executionId: string,
    delayMs: number,
    options: ScheduleOptions,
  ): Promise<void> {
    // Cap at QStash max (7 days), the workflow will re-schedule if more time needed
    const delaySeconds = Math.min(
      Math.max(0, Math.ceil(delayMs / 1000)),
      this.MAX_DELAY_SECONDS,
    );

    const message: QueueMessage = {
      executionId,
      retryCount: options.retryCount ?? 0,
      enqueuedAt: Date.now(),
      authorization: options.authorization,
    };

    if (delaySeconds === 0) {
      await this.client.publishJSON({
        url: this.destinationUrl,
        body: message,
        retries: 3,
      });
    } else {
      await this.client.publishJSON({
        url: this.destinationUrl,
        body: message,
        delay: delaySeconds,
        retries: 3,
      });
    }

    console.log(
      `[QSTASH] Scheduled ${executionId} with ${delaySeconds}s delay`,
    );
  }

  async scheduleAt(
    executionId: string,
    wakeAtEpochMs: number,
    options: ScheduleOptions,
  ): Promise<void> {
    const message: QueueMessage = {
      executionId,
      retryCount: options.retryCount ?? 0,
      enqueuedAt: Date.now(),
      authorization: options.authorization,
    };

    // Use notBefore for absolute scheduling (Unix timestamp in seconds)
    const notBeforeSeconds = Math.floor(wakeAtEpochMs / 1000);

    await this.client.publishJSON({
      url: this.destinationUrl,
      body: message,
      notBefore: notBeforeSeconds,
      retries: 3,
    });

    console.log(
      `[QSTASH] Scheduled ${executionId} at ${new Date(wakeAtEpochMs).toISOString()}`,
    );
  }
}

// ============================================================================
// QStash Receiver (for verifying incoming webhooks)
// ============================================================================

export interface QStashReceiverOptions {
  currentSigningKey: string;
  nextSigningKey: string;
}

/**
 * Create a QStash Receiver for verifying webhook signatures
 */
export function createQStashReceiver(options: QStashReceiverOptions): Receiver {
  return new Receiver({
    currentSigningKey: options.currentSigningKey,
    nextSigningKey: options.nextSigningKey,
  });
}

/**
 * Verify a QStash webhook request
 */
export async function verifyQStashSignature(
  receiver: Receiver,
  signature: string,
  body: string,
): Promise<boolean> {
  try {
    return await receiver.verify({ signature, body });
  } catch (error) {
    console.error("[QSTASH] Signature verification failed:", error);
    return false;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a QStash scheduler from environment variables
 */
export function createQStashScheduler(config: {
  qstashToken: string;
  baseUrl: string;
}): Scheduler {
  /**
   * Import a fetch polyfill only if you are using node prior to v18.
   * This is not necessary for nextjs, deno or cloudflare workers.
   */

  // The webhook endpoint that QStash will call
  const destinationUrl = `${config.baseUrl}/api/workflow-webhook`;

  return new QStashScheduler({
    token: config.qstashToken,
    destinationUrl,
  });
}
