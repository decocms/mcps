/**
 * Vibecoding Toolkit - Main Entry Point
 *
 * This is the main entry point for the Vibecoding Toolkit MCP server.
 * Built on Cloudflare Workers, it serves:
 * - MCP server at /mcp
 * - React application views at /
 * - Workflow webhook handler for QStash-based durable execution
 * - Cron-based orphan recovery for stuck workflows
 *
 * ## Scheduler Architecture
 *
 * The toolkit uses QStash for workflow scheduling:
 * - **Publishing**: QStash Client publishes messages with delays
 * - **Receiving**: Webhook endpoint verifies signatures and processes messages
 * - **Retries**: QStash handles retries automatically
 *
 * @see docs/SCHEDULER_ARCHITECTURE.md for full design
 * @see server/lib/scheduler.ts for scheduler implementations
 */
import { DefaultEnv, withRuntime } from "@decocms/runtime";
import { type Env as DecoEnv } from "../shared/deco.gen.ts";

import { tools } from "./tools/index.ts";
import { MessageBatch } from "@cloudflare/workers-types";
import { handleWorkflowQueue, handleQStashWebhook } from "./queue-handler.ts";
import { QueueMessage } from "./collections/workflow.ts";
import {
  createQStashReceiver,
  verifyQStashSignature,
} from "./workflow/scheduler.ts";

// Re-export library utilities
export * from "./lib/index.ts";

/**
 * This Env type is the main context object that is passed to
 * all of your Application.
 *
 * It includes all of the generated types from your
 * Deco bindings, along with the default ones.
 */
export type Env = DefaultEnv &
  DecoEnv & {
    ASSETS: {
      fetch: (request: Request, init?: RequestInit) => Promise<Response>;
    };
    POSTGRES: {
      RUN_SQL: (params: {
        query: string;
        params: any[];
      }) => Promise<{ rows: any[]; rowCount: number }>;
    };
    /** QStash token for publishing messages */
    QSTASH_TOKEN: string;
    /** QStash signing key for verifying incoming webhooks */
    QSTASH_CURRENT_SIGNING_KEY: string;
    /** QStash next signing key (for key rotation) */
    QSTASH_NEXT_SIGNING_KEY: string;
  };

const runtime = withRuntime<Env>({
  tools,
  /**
   * Fallback directly to assets for all requests that do not match a tool or auth.
   * If you wanted to add custom api routes that dont make sense to be a tool,
   * you can add them on this handler.
   */
  fetch: (req, env) => {
    const url = new URL(req.url);

    // Handle QStash webhook for workflow execution
    if (url.pathname === "/api/workflow-webhook") {
      return handleWorkflowWebhook(req, env);
    }

    return env.ASSETS.fetch(req);
  },
});

/**
 * Handle incoming QStash webhook for workflow execution
 *
 * This endpoint receives messages from QStash, verifies the signature,
 * and processes the workflow execution.
 */
async function handleWorkflowWebhook(
  req: Request,
  env: Env,
): Promise<Response> {
  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = req.headers.get("Upstash-Signature");
  if (!signature) {
    console.warn("[WEBHOOK] Missing Upstash-Signature header");
    return new Response("Missing signature", { status: 401 });
  }

  const body = await req.text();

  // Verify the QStash signature
  const receiver = createQStashReceiver({
    currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
  });

  const isValid = await verifyQStashSignature(receiver, signature, body);
  if (!isValid) {
    console.warn("[WEBHOOK] Invalid QStash signature");
    return new Response("Invalid signature", { status: 401 });
  }

  // Process the workflow message
  try {
    const result = await handleQStashWebhook(body, env);

    if (result.success) {
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } else {
      // Return 500 to trigger QStash retry for retryable errors
      return new Response(JSON.stringify(result), {
        status: result.retryable ? 500 : 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error("[WEBHOOK] Unexpected error:", error);
    // Return 500 to trigger QStash retry
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export default {
  ...runtime,

  /**
   * Queue handler for workflow execution (legacy Cloudflare Queues).
   * Kept for backward compatibility during migration.
   */
  async queue(batch: MessageBatch<QueueMessage>, env: Env) {
    await handleWorkflowQueue(batch, env);
  },
};
