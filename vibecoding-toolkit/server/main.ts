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
import { handleQStashWebhook } from "./queue-handler.ts";
import {
  createQStashReceiver,
  verifyQStashSignature,
} from "./workflow/scheduler.ts";

// Re-export library utilities
export * from "./lib/index.ts";
import { type DefaultEnv, withRuntime } from "@decocms/runtime";
import {
  type Env as DecoEnv,
  Scopes,
  StateSchema,
} from "../shared/deco.gen.ts";

import { tools } from "./tools/index.ts";

/**
 * This Env type is the main context object that is passed to
 * all of your Application.
 *
 * It includes all of the generated types from your
 * Deco bindings, along with the default ones.
 */

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
export type Env = DefaultEnv<typeof StateSchema> & DecoEnv;

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    /**
     * These scopes define the asking permissions of your
     * app when a user is installing it. When a user
     * authorizes your app for using AI_GENERATE, you will
     * now be able to use `env.AI_GATEWAY.AI_GENERATE`
     * and utilize the user's own AI Gateway, without having to
     * deploy your own, setup any API keys, etc.
     */
    scopes: [Scopes.DATABASE.DATABASES_RUN_SQL],
    /**
     * The state schema of your Application defines what
     * your installed App state will look like. When a user
     * is installing your App, they will have to fill in
     * a form with the fields defined in the state schema.
     *
     * This is powerful for building multi-tenant apps,
     * where you can have multiple users and projects
     * sharing different configurations on the same app.
     *
     * When you define a binding dependency on another app,
     * it will automatically be linked to your StateSchema on
     * type generation. You can also `.extend` it to add more
     * fields to the state schema, like asking for an API Key
     * for connecting to a third-party service.
     */
    state: StateSchema,
  },
  tools,
  bindings: [
    {
      type: "mcp",
      name: "DATABASE",
      app_name: "@deco/database",
    },
  ],
  cors: {
    origin: (origin) => {
      // Allow localhost and configured origins
      if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
        return origin;
      }
      // TODO: Configure allowed origins from environment
      return origin;
    },
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "mcp-protocol-version"],
  },
});

export default {
  fetch: (req: Request) => {
    const url = new URL(req.url);

    // Handle QStash webhook for workflow execution
    if (url.pathname === "/api/workflow-webhook") {
      return handleWorkflowWebhook(req, { ...process.env });
    }
    if (url.pathname === "/_healthcheck") {
      return new Response("OK", { status: 200 });
    }
    return runtime.fetch(req, { ...process.env });
  },
};
